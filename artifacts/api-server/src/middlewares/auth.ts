import { Request, Response, NextFunction } from "express";
import { verifyJwt, type JwtPayload } from "../lib/jwt.js";

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function requireAuth(roles?: Array<"user" | "merchant" | "admin">) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const token = authHeader.slice(7);
    const payload = verifyJwt(token);
    if (!payload) {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }
    if (roles && !roles.includes(payload.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    req.user = payload;
    next();
  };
}
