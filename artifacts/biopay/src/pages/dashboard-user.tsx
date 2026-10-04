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
import { clearAuth, getToken } from "@/lib/auth";
import { disconnectSocket, socket } from "@/lib/socket";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Hand, LogOut, TrendingUp, Plus, CheckCircle, XCircle, RefreshCw, Fingerprint, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function DashboardUser() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [topupOpen, setTopupOpen] = useState(false);
  const [topupAmount, setTopupAmount] = useState("");
  const [balanceGlow, setBalanceGlow] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [enrollSessionId, setEnrollSessionId] = useState("");
  const [enrollPending, setEnrollPending] = useState(false);

  const { data: profile, isLoading } = useGetUserProfile();
  const { data: txData, isLoading: txLoading } = useGetUserTransactions({ page: 1, limit: 20 });
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

    const handleBiometricSuccess = () => {
      setEnrollOpen(false);
      setEnrollSessionId("");
      queryClient.invalidateQueries({ queryKey: getGetUserProfileQueryKey() });
      toast({
        title: "Biometric enrolled successfully!",
        description: "Your palm vein data has been securely registered to your account.",
        className: "bg-green-500 text-white font-mono",
      });
    };

    socket.on("wallet:updated", handleWalletUpdate);
    socket.on("biometric:success", handleBiometricSuccess);

    return () => {
      socket.off("wallet:updated", handleWalletUpdate);
      socket.off("biometric:success", handleBiometricSuccess);
    };
  }, [queryClient, toast]);

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSettled: () => { clearAuth(); disconnectSocket(); setLocation("/"); },
    });
  };

  const handleEnroll = async () => {
    try {
      setEnrollPending(true);
      const res = await fetch("/api/users/me/biometric/initiate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
      });

      if (!res.ok) {
        throw new Error("Failed to initiate biometric scan");
      }

      const data = await res.json() as { session_id: string; status: string };
      setEnrollSessionId(data.session_id);
      setEnrollOpen(true);
      toast({
        title: "Enrollment mode active",
        description: "Please proceed to the physical kiosk to scan your palm.",
      });
    } catch (err) {
      toast({
        title: "Enrollment failed",
        description: err instanceof Error ? err.message : "Could not talk to API server.",
        variant: "destructive",
      });
    } finally {
      setEnrollPending(false);
    }
  };

  const handleCancelEnroll = async () => {
    try {
      await fetch("/api/users/me/biometric/cancel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
      });
      setEnrollOpen(false);
      setEnrollSessionId("");
      toast({
        title: "Enrollment cancelled",
        description: "Kiosk enrollment mode has been reset.",
      });
    } catch (err) {
      // Clean up local state regardless
      setEnrollOpen(false);
      setEnrollSessionId("");
    }
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
              <Button data-testid="button-enroll-biometric" onClick={handleEnroll} disabled={enrollPending} variant="outline" className="font-mono text-xs border-yellow-500/50 hover:border-yellow-500">
                {enrollPending ? <><RefreshCw className="w-3 h-3 mr-2 animate-spin" />SCANNING...</> : "ENROLL NOW"}
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

      {/* Biometric Enrollment Pending Dialog */}
      <Dialog open={enrollOpen} onOpenChange={(open) => { if (!open) handleCancelEnroll(); }}>
        <DialogContent className="bg-card border-border max-w-sm overflow-hidden relative">
          <style>{`
            @keyframes scanLaser {
              0% { top: 0%; opacity: 0; }
              10% { opacity: 1; }
              90% { opacity: 1; }
              100% { top: 100%; opacity: 0; }
            }
            @keyframes radarPulse {
              0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(234, 179, 8, 0.4); }
              70% { transform: scale(1.05); box-shadow: 0 0 0 15px rgba(234, 179, 8, 0); }
              100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(234, 179, 8, 0); }
            }
          `}</style>
          <DialogHeader>
            <DialogTitle className="font-mono text-center tracking-wider text-yellow-500">BIOMETRIC ENROLLMENT</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center py-8 space-y-6">
            <div 
              className="relative w-36 h-36 rounded-full flex items-center justify-center bg-yellow-500/10 border border-yellow-500/30"
              style={{ animation: "radarPulse 2s infinite ease-in-out" }}
            >
              <div className="absolute inset-4 rounded-full border border-dashed border-yellow-500/20" />
              <Fingerprint className="w-16 h-16 text-yellow-500 animate-pulse" />
              {/* Scan Line */}
              <div 
                className="absolute left-0 right-0 h-0.5 bg-yellow-400 shadow-[0_0_10px_rgba(234,179,8,0.8)]"
                style={{ animation: "scanLaser 2.5s infinite linear" }}
              />
            </div>

            <div className="text-center space-y-2">
              <p className="font-mono font-bold text-sm tracking-tight text-foreground">AWAITING PALM SCANS</p>
              <p className="text-xs text-muted-foreground max-w-[250px] mx-auto leading-relaxed">
                Please place and shift your palm over the BioPay kiosk scanner terminal as prompted on the OLED screen.
              </p>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-yellow-500/10 border border-yellow-500/20 text-[10px] text-yellow-500 font-mono">
                <Loader2 className="w-3 h-3 animate-spin" /> KIOSK TERMINAL #1 ACTIVE
              </div>
            </div>

            <Button 
              variant="outline" 
              onClick={handleCancelEnroll}
              className="font-mono text-xs text-muted-foreground border-border hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"
            >
              CANCEL ENROLLMENT
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
