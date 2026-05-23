import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, merchantsTable, transactionsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { emitToMerchant, emitToUser } from "../lib/socket.js";
import { activeSessions } from "./merchants.js";
import { activeEnrollments } from "./users.js";
import { isBlacklisted, computeJaccardSimilarity, countActiveBits } from "../lib/biometrics.js";

const router = Router();

router.get("/hardware/active-session/:merchant_id", async (req, res) => {
  const merchant_id = Number(req.params.merchant_id);
  const session = activeSessions.get(merchant_id);
  if (session && session.status === "WAITING") {
    const sessionAge = Date.now() - (session.created_at || 0);
    if (sessionAge > 60000) { // 60 seconds timeout
      activeSessions.delete(merchant_id);
      emitToMerchant(merchant_id, "payment:failed", { error: "Transaction timed out" });
      res.json({ active: false });
    } else {
      res.json({ active: true, amount: session.amount, session_id: session.session_id });
    }
  } else {
    res.json({ active: false });
  }
});

router.post("/hardware/verify-scan", async (req, res) => {
  let { biometric_hash, merchant_id, amount, is_final } = req.body as {
    biometric_hash: string;
    merchant_id: number | string;
    amount: number;
    is_final?: boolean;
  };
  merchant_id = Number(merchant_id);

  if (!biometric_hash || !merchant_id || !amount) {
    res.status(400).json({ error: "biometric_hash, merchant_id, and amount are required" });
    return;
  }

  if (isBlacklisted(biometric_hash)) {
    res.status(400).json({ error: "Invalid biometric scan quality (blank frame detected)" });
    return;
  }

  if (biometric_hash.length === 256) {
    const activeBits = countActiveBits(biometric_hash);
    if (activeBits < 15) {
      res.status(400).json({ error: "Invalid biometric scan quality (insufficient details/blank scan)" });
      return;
    }
  }

  try {
    const session = activeSessions.get(merchant_id);
    if (!session || session.status !== "WAITING" || session.amount !== amount) {
      res.status(400).json({ error: "Invalid or expired payment session" });
      return;
    }

    let user = null;

    if (biometric_hash.length !== 256) {
      // 1. Backward-compatible exact match check for unit tests and simulated scans (SHA256 or mock strings)
      user = await db.query.usersTable.findFirst({
        where: (u, { and, eq, or, like }) => and(
          eq(u.is_verified, true),
          or(
            eq(u.biometric_template, biometric_hash),
            like(u.biometric_template, `${biometric_hash},%`),
            like(u.biometric_template, `%,${biometric_hash}`),
            like(u.biometric_template, `%,${biometric_hash},%`)
          )
        )
      });
    } else {
      // 2. Real physical match check using Jaccard Similarity (32x32 Grid, 256 hex chars)
      const allVerified = await db.query.usersTable.findMany({
        where: (u, { and, eq, isNotNull }) => and(
          eq(u.is_verified, true),
          isNotNull(u.biometric_template)
        )
      });

      const userScores: { user: any; score: number }[] = [];

      for (const candidate of allVerified) {
        if (!candidate.biometric_template) continue;
        const templates = candidate.biometric_template.split(",");
        let maxUserScore = 0;
        let hasValidTemplate = false;
        for (const tmpl of templates) {
          const trimmed = tmpl.trim();
          if (trimmed.length === 256) {
            hasValidTemplate = true;
            const score = computeJaccardSimilarity(biometric_hash, trimmed);
            if (score > maxUserScore) {
              maxUserScore = score;
            }
          }
        }
        if (hasValidTemplate) {
          userScores.push({ user: candidate, score: maxUserScore });
        }
      }

      // Sort user scores in descending order
      userScores.sort((a, b) => b.score - a.score);

      const bestMatch = userScores[0] || null;
      const secondBestMatch = userScores[1] || null;

      const bestScore = bestMatch ? bestMatch.score : 0;
      const matchedUser = bestMatch ? bestMatch.user : null;
      const secondBestScore = secondBestMatch ? secondBestMatch.score : 0;
      const secondBestUser = secondBestMatch ? secondBestMatch.user : null;

      const delta = bestScore - secondBestScore;
      console.log(`[verify-scan] Physical matching completed.`);
      console.log(`  - Best Match: ${matchedUser?.name || "None"} (Score: ${bestScore.toFixed(4)})`);
      console.log(`  - Runner-up Match: ${secondBestUser?.name || "None"} (Score: ${secondBestScore.toFixed(4)})`);
      console.log(`  - Match Delta: ${delta.toFixed(4)}`);

      // Calibrated thresholds
      const ABSOLUTE_THRESHOLD = 0.35; // Require 35% Jaccard matching for physical scans
      const MIN_DELTA = 0.02; // Require at least 0.02 separation between the best user and runner-up user

      if (bestScore >= ABSOLUTE_THRESHOLD && (userScores.length <= 1 || delta >= MIN_DELTA)) {
        user = matchedUser;
        console.log(`[verify-scan] Match SUCCESS! User: ${user?.name} (Score: ${bestScore.toFixed(4)}, Delta: ${delta.toFixed(4)})`);
      } else {
        if (bestScore < ABSOLUTE_THRESHOLD) {
          console.log(`[verify-scan] Match FAILED. Best score ${bestScore.toFixed(4)} is below threshold ${ABSOLUTE_THRESHOLD} (35% matching required)`);
        } else {
          console.log(`[verify-scan] Match FAILED. Match is ambiguous. Delta ${delta.toFixed(4)} is below safety margin ${MIN_DELTA}`);
        }
      }
    }

    if (!user) {
      if (is_final !== false) {
        emitToMerchant(merchant_id, "payment:failed", { error: "Biometric not recognized" });
      }
      res.status(404).json({ error: "No user found matching this biometric" });
      return;
    }

    const merchant = await db.query.merchantsTable.findFirst({
      where: (m, { eq }) => eq(m.id, merchant_id),
    });

    if (!merchant) {
      res.status(404).json({ error: "Merchant not found" });
      return;
    }

    if (parseFloat(user.wallet_balance) < amount) {
      await db.insert(transactionsTable).values({
        user_id: user.id,
        merchant_id,
        amount: String(amount),
        type: "PURCHASE",
        status: "FAILED",
      });
      emitToMerchant(merchant_id, "payment:failed", { error: "Insufficient wallet balance", user_name: user.name });
      emitToUser(user.id, "wallet:updated", { wallet_balance: parseFloat(user.wallet_balance) });
      activeSessions.delete(merchant_id);
      res.status(402).json({ error: "Insufficient wallet balance" });
      return;
    }

    const { updatedUser, updatedMerchant, txn } = await db.transaction(async (tx) => {
      const [u] = await tx
        .update(usersTable)
        .set({ wallet_balance: sql`wallet_balance - ${amount}` })
        .where(eq(usersTable.id, user.id))
        .returning({ wallet_balance: usersTable.wallet_balance });

      const [m] = await tx
        .update(merchantsTable)
        .set({ merchant_balance: sql`merchant_balance + ${amount}` })
        .where(eq(merchantsTable.id, merchant_id))
        .returning({ merchant_balance: merchantsTable.merchant_balance });

      const [t] = await tx.insert(transactionsTable).values({
        user_id: user.id,
        merchant_id,
        amount: String(amount),
        type: "PURCHASE",
        status: "SUCCESS",
      }).returning();

      return { updatedUser: u, updatedMerchant: m, txn: t };
    });

    activeSessions.delete(merchant_id);
    const newBalance = parseFloat(updatedUser.wallet_balance);

    emitToMerchant(merchant_id, "payment:success", {
      amount,
      user_name: user.name,
      transaction_id: txn.id,
      merchant_balance: parseFloat(updatedMerchant.merchant_balance),
    });

    emitToUser(user.id, "wallet:updated", { wallet_balance: newBalance });

    res.json({
      success: true,
      transaction_id: txn.id,
      amount,
      user_name: user.name,
      merchant_name: merchant.shop_name,
      new_balance: newBalance,
    });
  } catch (err) {
    req.log.error(err);
    activeSessions.delete(merchant_id);
    emitToMerchant(merchant_id, "payment:failed", { error: "Server error during payment processing" });
    res.status(500).json({ error: "Payment processing failed" });
  }
});

router.post("/hardware/heartbeat", async (req, res) => {
  const { kiosk_id } = req.body as { kiosk_id: string };
  if (!kiosk_id) { res.status(400).json({ error: "kiosk_id required" }); return; }
  try {
    await db
      .update(merchantsTable)
      .set({ is_online: true, last_seen: new Date() })
      .where(eq(merchantsTable.kiosk_id, kiosk_id));
    res.json({ message: "Heartbeat acknowledged" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Heartbeat failed" });
  }
});

router.get("/hardware/active-enrollment/:merchant_id", async (req, res) => {
  const merchant_id = Number(req.params.merchant_id);
  const session = activeEnrollments.get(merchant_id);
  if (session && session.status === "WAITING") {
    const sessionAge = Date.now() - (session.created_at || 0);
    if (sessionAge > 120000) { // 120 seconds timeout
      activeEnrollments.delete(merchant_id);
      res.json({ active: false });
    } else {
      try {
        const user = await db.query.usersTable.findFirst({
          where: (u, { eq }) => eq(u.id, session.user_id),
        });
        res.json({ active: true, user_name: user?.name || "User", session_id: session.session_id });
      } catch (err) {
        res.status(500).json({ error: "Failed to query enrollment user" });
      }
    }
  } else {
    res.json({ active: false });
  }
});

router.post("/hardware/register-scan", async (req, res) => {
  let { biometric_hash, merchant_id } = req.body as {
    biometric_hash: string;
    merchant_id: number | string;
  };
  merchant_id = Number(merchant_id);

  if (!biometric_hash || !merchant_id) {
    res.status(400).json({ error: "biometric_hash and merchant_id are required" });
    return;
  }

  if (isBlacklisted(biometric_hash)) {
    res.status(400).json({ error: "Invalid biometric scan quality (blank frame detected)" });
    return;
  }

  // Validate active bits quality
  if (biometric_hash && (biometric_hash.length === 256 || biometric_hash.includes(","))) {
    const newTemplates = biometric_hash.split(",");
    for (const newTmpl of newTemplates) {
      const trimmed = newTmpl.trim();
      if (trimmed.length === 256) {
        const activeBits = countActiveBits(trimmed);
        if (activeBits < 15) {
          res.status(400).json({ error: "Invalid biometric scan quality (insufficient details/blank scan)" });
          return;
        }
      }
    }
  }

  try {
    const session = activeEnrollments.get(merchant_id);
    if (!session || session.status !== "WAITING") {
      res.status(400).json({ error: "Invalid or expired enrollment session" });
      return;
    }

    // Collision Check: Ensure this template doesn't collide with any other enrolled user
    if (biometric_hash && (biometric_hash.length === 256 || biometric_hash.includes(","))) {
      const newTemplates = biometric_hash.split(",");
      const allVerified = await db.query.usersTable.findMany({
        where: (u, { and, eq, isNotNull }) => and(
          eq(u.is_verified, true),
          isNotNull(u.biometric_template)
        )
      });

      for (const candidate of allVerified) {
        if (candidate.id === session.user_id) continue;
        if (!candidate.biometric_template) continue;
        const existingTemplates = candidate.biometric_template.split(",");
        
        for (const newTmpl of newTemplates) {
          const newTrimmed = newTmpl.trim();
          if (newTrimmed.length !== 256) continue;
          
          for (const extTmpl of existingTemplates) {
            const extTrimmed = extTmpl.trim();
            if (extTrimmed.length !== 256) continue;
            
            const score = computeJaccardSimilarity(newTrimmed, extTrimmed);
            if (score >= 0.40) {
              console.log(`[register-scan] Collision detected! New template matches existing user ${candidate.name} (Score: ${score.toFixed(4)})`);
              activeEnrollments.delete(merchant_id);
              res.status(400).json({ error: "Biometric collision detected. This palm is already registered to another account." });
              return;
            }
          }
        }
      }
    }

    // Update the user's template in the DB
    await db.update(usersTable)
      .set({ biometric_template: biometric_hash, is_verified: true })
      .where(eq(usersTable.id, session.user_id));

    activeEnrollments.delete(merchant_id);

    // Notify the user via socket
    emitToUser(session.user_id, "biometric:success", { biometric_hash });

    res.json({ success: true, message: "Biometric enrolled successfully" });
  } catch (err) {
    req.log.error(err);
    activeEnrollments.delete(merchant_id);
    res.status(500).json({ error: "Failed to register scan" });
  }
});

export default router;
