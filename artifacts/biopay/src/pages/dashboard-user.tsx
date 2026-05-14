import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  useGetUserProfile, getGetUserProfileQueryKey,
  useGetUserTransactions,
  useEnrollBiometric,
  useCreateTopupOrder,
  useVerifyTopupPayment,
  useLogout,
} from "@workspace/api-client-react";
import { clearAuth } from "@/lib/auth";
import { disconnectSocket, socket } from "@/lib/socket";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Hand, LogOut, TrendingUp, Plus, CheckCircle, XCircle, RefreshCw, Fingerprint } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function DashboardUser() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [topupOpen, setTopupOpen] = useState(false);
  const [topupAmount, setTopupAmount] = useState("");
  const [balanceGlow, setBalanceGlow] = useState(false);

  const { data: profile, isLoading } = useGetUserProfile();
  const { data: txData, isLoading: txLoading } = useGetUserTransactions({ page: 1, limit: 20 });
  const enrollMutation = useEnrollBiometric();
  const createOrderMutation = useCreateTopupOrder();
  const verifyMutation = useVerifyTopupPayment();
  const logoutMutation = useLogout();

  useEffect(() => {
    const handleWalletUpdate = (data: { wallet_balance: number }) => {
      setBalanceGlow(true);
      setTimeout(() => setBalanceGlow(false), 2000);
      queryClient.invalidateQueries({ queryKey: getGetUserProfileQueryKey() });
      toast({ title: "Balance updated", description: `New balance: ₹${data.wallet_balance.toFixed(2)}` });
    };
    socket.on("wallet:updated", handleWalletUpdate);
    return () => { socket.off("wallet:updated", handleWalletUpdate); };
  }, [queryClient, toast]);

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSettled: () => { clearAuth(); disconnectSocket(); setLocation("/"); },
    });
  };

  const handleEnroll = () => {
    const crypto = window.crypto;
    const arr = new Uint8Array(32);
    crypto.getRandomValues(arr);
    const hash = Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
    enrollMutation.mutate({ data: { biometric_hash: hash } }, {
      onSuccess: () => {
        toast({ title: "Biometric enrolled", description: "Your palm vein data has been registered." });
        queryClient.invalidateQueries({ queryKey: getGetUserProfileQueryKey() });
      },
      onError: () => toast({ title: "Enrollment failed", variant: "destructive" }),
    });
  };

  const handleTopup = () => {
    const amount = parseFloat(topupAmount);
    if (!amount || amount < 10) { toast({ title: "Minimum ₹10", variant: "destructive" }); return; }
    createOrderMutation.mutate({ data: { amount } }, {
      onSuccess: (order) => {
        const fakePaymentId = `pay_${Math.random().toString(36).slice(2, 14)}`;
        const fakeSig = `sig_${Math.random().toString(36).slice(2, 30)}`;
        verifyMutation.mutate({
          data: {
            razorpay_order_id: order.razorpay_order_id,
            razorpay_payment_id: fakePaymentId,
            razorpay_signature: fakeSig,
          },
        }, {
          onSuccess: (res) => {
            toast({ title: "Wallet topped up!", description: `₹${amount} added. New balance: ₹${res.wallet_balance.toFixed(2)}` });
            setTopupOpen(false);
            setTopupAmount("");
            queryClient.invalidateQueries({ queryKey: getGetUserProfileQueryKey() });
          },
          onError: () => toast({ title: "Payment failed", variant: "destructive" }),
        });
      },
      onError: () => toast({ title: "Could not create order", variant: "destructive" }),
    });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Hand className="w-5 h-5 text-primary" />
            <span className="font-mono font-bold text-sm tracking-tight">BIOPAY / USER</span>
          </div>
          <div className="flex items-center gap-3">
            <span data-testid="text-username" className="text-sm text-muted-foreground font-mono">{profile?.name ?? "..."}</span>
            <Button variant="outline" size="sm" onClick={handleLogout} className="font-mono text-xs gap-1">
              <LogOut className="w-3 h-3" /> LOGOUT
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Wallet Card */}
        <Card className={`p-8 border transition-all duration-500 ${balanceGlow ? "border-primary shadow-[0_0_30px_rgba(0,255,255,0.3)]" : "border-border"}`}>
          <div className="flex items-start justify-between mb-6">
            <div>
              <p className="text-xs font-mono text-muted-foreground mb-1">WALLET BALANCE</p>
              {isLoading ? (
                <Skeleton className="h-14 w-48" />
              ) : (
                <div data-testid="text-wallet-balance" className={`text-5xl font-mono font-bold transition-all duration-300 ${balanceGlow ? "text-primary" : "text-foreground"}`}>
                  ₹{parseFloat(String(profile?.wallet_balance ?? 0)).toFixed(2)}
                </div>
              )}
            </div>
            <Button data-testid="button-add-funds" onClick={() => setTopupOpen(true)} className="font-mono gap-2">
              <Plus className="w-4 h-4" /> ADD FUNDS
            </Button>
          </div>
          <div className="flex gap-4">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${profile?.is_verified ? "bg-primary" : "bg-muted-foreground"}`} />
              <span className="text-xs font-mono text-muted-foreground">{profile?.is_verified ? "VERIFIED" : "UNVERIFIED"}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${profile?.biometric_enrolled ? "bg-green-500" : "bg-yellow-500"}`} />
              <span className="text-xs font-mono text-muted-foreground">{profile?.biometric_enrolled ? "BIOMETRIC ENROLLED" : "NO BIOMETRIC"}</span>
            </div>
          </div>
        </Card>

        {/* Biometric Enrollment */}
        {!profile?.biometric_enrolled && (
          <Card className="p-6 border-yellow-500/30 bg-yellow-500/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Fingerprint className="w-8 h-8 text-yellow-500" />
                <div>
                  <p className="font-mono font-bold text-sm">ENROLL PALM VEIN</p>
                  <p className="text-xs text-muted-foreground">Required to make payments at kiosks</p>
                </div>
              </div>
              <Button data-testid="button-enroll-biometric" onClick={handleEnroll} disabled={enrollMutation.isPending} variant="outline" className="font-mono text-xs border-yellow-500/50 hover:border-yellow-500">
                {enrollMutation.isPending ? <><RefreshCw className="w-3 h-3 mr-2 animate-spin" />SCANNING...</> : "ENROLL NOW"}
              </Button>
            </div>
          </Card>
        )}

        {/* Transaction History */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-mono font-bold text-sm text-muted-foreground">TRANSACTION HISTORY</h2>
          </div>
          <Card className="border-border overflow-hidden">
            {txLoading ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : txData?.items.length === 0 ? (
              <div className="py-16 text-center">
                <TrendingUp className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm font-mono text-muted-foreground">NO TRANSACTIONS YET</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {txData?.items.map((txn) => (
                  <div key={txn.id} data-testid={`row-transaction-${txn.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${txn.status === "SUCCESS" ? "bg-green-500/10" : "bg-destructive/10"}`}>
                        {txn.status === "SUCCESS" ? <CheckCircle className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-destructive" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs font-mono">{txn.type}</Badge>
                          {txn.merchant_name && <span className="text-xs text-muted-foreground font-mono">{txn.merchant_name}</span>}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{formatDistanceToNow(new Date(txn.timestamp), { addSuffix: true })}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p data-testid={`text-amount-${txn.id}`} className={`font-mono font-bold text-sm ${txn.type === "TOPUP" ? "text-green-500" : "text-foreground"}`}>
                        {txn.type === "TOPUP" ? "+" : "-"}₹{txn.amount.toFixed(2)}
                      </p>
                      <Badge variant={txn.status === "SUCCESS" ? "default" : "destructive"} className="text-xs">{txn.status}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </main>

      {/* Top-up Dialog */}
      <Dialog open={topupOpen} onOpenChange={setTopupOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-mono">ADD FUNDS TO WALLET</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-xs font-mono text-muted-foreground">AMOUNT (INR)</label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono">₹</span>
                <Input
                  data-testid="input-topup-amount"
                  type="number"
                  min="10"
                  placeholder="100"
                  value={topupAmount}
                  onChange={(e) => setTopupAmount(e.target.value)}
                  className="pl-7 font-mono"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">Minimum ₹10</p>
            </div>
            <div className="flex gap-2">
              {[100, 500, 1000].map((amt) => (
                <Button key={amt} variant="outline" size="sm" onClick={() => setTopupAmount(String(amt))} className="flex-1 font-mono text-xs">
                  ₹{amt}
                </Button>
              ))}
            </div>
            <Button
              data-testid="button-confirm-topup"
              onClick={handleTopup}
              disabled={createOrderMutation.isPending || verifyMutation.isPending}
              className="w-full font-mono"
            >
              {createOrderMutation.isPending || verifyMutation.isPending
                ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />PROCESSING...</>
                : "CONFIRM TOP-UP"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
