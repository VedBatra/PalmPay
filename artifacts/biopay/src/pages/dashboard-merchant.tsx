import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  useGetMerchantProfile,
  useGetMerchantTransactions,
  useGetMerchantEarningsSummary, getGetMerchantEarningsSummaryQueryKey,
  useInitiatePayment,
  useCancelPayment,
  useLogout,
} from "@workspace/api-client-react";
import { clearAuth } from "@/lib/auth";
import { disconnectSocket, socket } from "@/lib/socket";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Store, LogOut, CheckCircle, XCircle, Delete, TrendingUp } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type ScanStatus = "IDLE" | "WAITING" | "SUCCESS" | "FAILED" | "CANCELLED";

interface PaymentSuccessData {
  amount: number;
  user_name: string;
  transaction_id: number;
}

export default function DashboardMerchant() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [scanStatus, setScanStatus] = useState<ScanStatus>("IDLE");
  const [lastPayment, setLastPayment] = useState<PaymentSuccessData | null>(null);

  const { data: profile, isLoading } = useGetMerchantProfile();
  const { data: txData } = useGetMerchantTransactions({ page: 1, limit: 10 });
  const { data: earnings } = useGetMerchantEarningsSummary();
  const initiateMutation = useInitiatePayment();
  const cancelMutation = useCancelPayment();
  const logoutMutation = useLogout();

  useEffect(() => {
    socket.on("payment:waiting", () => setScanStatus("WAITING"));
    socket.on("payment:success", (data: PaymentSuccessData) => {
      setScanStatus("SUCCESS");
      setLastPayment(data);
      queryClient.invalidateQueries({ queryKey: getGetMerchantEarningsSummaryQueryKey() });
      setAmount("");
    });
    socket.on("payment:failed", () => setScanStatus("FAILED"));
    socket.on("payment:cancelled", () => setScanStatus("CANCELLED"));

    return () => {
      socket.off("payment:waiting");
      socket.off("payment:success");
      socket.off("payment:failed");
      socket.off("payment:cancelled");
    };
  }, [queryClient]);

  const handleKeypad = (val: string) => {
    if (val === "." && amount.includes(".")) return;
    if (val === "DEL") { setAmount((a) => a.slice(0, -1)); return; }
    if (amount.length >= 8) return;
    setAmount((a) => a + val);
  };

  const handleInitiate = () => {
    const numAmt = parseFloat(amount);
    if (!numAmt || numAmt < 1) { toast({ title: "Enter a valid amount", variant: "destructive" }); return; }
    setScanStatus("WAITING");
    initiateMutation.mutate({ data: { amount: numAmt } }, {
      onError: () => { setScanStatus("IDLE"); toast({ title: "Failed to initiate", variant: "destructive" }); },
    });
  };

  const handleCancel = () => {
    cancelMutation.mutate(undefined, { onSettled: () => setScanStatus("IDLE") });
  };

  const handleReset = () => { setScanStatus("IDLE"); setLastPayment(null); };

  const handleLogout = () => {
    logoutMutation.mutate(undefined, { onSettled: () => { clearAuth(); disconnectSocket(); setLocation("/"); } });
  };

  const keys = ["7", "8", "9", "4", "5", "6", "1", "2", "3", ".", "0", "DEL"];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Store className="w-5 h-5 text-primary" />
            <span className="font-mono font-bold text-sm tracking-tight">BIOPAY / POS</span>
            {!isLoading && <span className="text-xs text-muted-foreground font-mono">— {profile?.shop_name}</span>}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span className="text-xs font-mono text-muted-foreground">{profile?.kiosk_id ?? "..."}</span>
            </div>
            <Button variant="outline" size="sm" onClick={handleLogout} className="font-mono text-xs gap-1">
              <LogOut className="w-3 h-3" /> LOGOUT
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* POS Panel */}
          <div className="space-y-4">
            {/* Amount Display */}
            <Card className="p-6 border-border">
              <p className="text-xs font-mono text-muted-foreground mb-2">AMOUNT TO CHARGE</p>
              <div data-testid="text-pos-amount" className="text-5xl font-mono font-bold text-right min-h-[3.5rem]">
                {amount ? `₹${amount}` : <span className="text-muted-foreground/30">₹0</span>}
              </div>
            </Card>

            {/* Keypad */}
            <Card className="p-4 border-border">
              <div className="grid grid-cols-3 gap-2">
                {keys.map((k) => (
                  <button
                    key={k}
                    data-testid={`button-key-${k}`}
                    onClick={() => handleKeypad(k)}
                    disabled={scanStatus === "WAITING"}
                    className="h-14 rounded-lg bg-muted hover:bg-muted/70 active:scale-95 transition-all font-mono text-lg font-bold disabled:opacity-40 flex items-center justify-center"
                  >
                    {k === "DEL" ? <Delete className="w-5 h-5" /> : k}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                {scanStatus === "WAITING" ? (
                  <Button data-testid="button-cancel-payment" onClick={handleCancel} variant="destructive" className="flex-1 font-mono" disabled={cancelMutation.isPending}>
                    CANCEL SCAN
                  </Button>
                ) : scanStatus === "IDLE" ? (
                  <Button data-testid="button-initiate-scan" onClick={handleInitiate} className="flex-1 font-mono text-base h-12" disabled={!amount || initiateMutation.isPending}>
                    INITIATE SCAN
                  </Button>
                ) : (
                  <Button data-testid="button-reset-pos" onClick={handleReset} variant="outline" className="flex-1 font-mono">
                    NEW PAYMENT
                  </Button>
                )}
              </div>
            </Card>

            {/* Scan Status */}
            <Card className={`p-6 border transition-all duration-500 ${
              scanStatus === "WAITING" ? "border-yellow-500/50 bg-yellow-500/5" :
              scanStatus === "SUCCESS" ? "border-green-500/50 bg-green-500/5" :
              scanStatus === "FAILED" ? "border-destructive/50 bg-destructive/5" : "border-border"
            }`}>
              {scanStatus === "IDLE" && (
                <div className="text-center py-4">
                  <div className="w-12 h-12 rounded-full border-2 border-muted-foreground/20 flex items-center justify-center mx-auto mb-3">
                    <span className="text-muted-foreground/40 text-2xl font-mono">○</span>
                  </div>
                  <p className="font-mono text-sm text-muted-foreground">ENTER AMOUNT AND INITIATE SCAN</p>
                </div>
              )}
              {scanStatus === "WAITING" && (
                <div className="text-center py-4">
                  <div className="relative w-16 h-16 mx-auto mb-4">
                    <div className="absolute inset-0 rounded-full border-4 border-yellow-500/30 animate-ping" />
                    <div className="absolute inset-2 rounded-full border-4 border-yellow-500/50 animate-ping animation-delay-200" />
                    <div className="w-16 h-16 rounded-full border-4 border-yellow-500 flex items-center justify-center">
                      <span className="text-yellow-500 text-xl">✋</span>
                    </div>
                  </div>
                  <p className="font-mono text-sm text-yellow-500 font-bold">WAITING FOR PALM SCAN</p>
                  <p className="text-xs text-muted-foreground mt-1 font-mono">Charging: ₹{parseFloat(amount || "0").toFixed(2)}</p>
                </div>
              )}
              {scanStatus === "SUCCESS" && lastPayment && (
                <div className="text-center py-4">
                  <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
                  <p data-testid="status-payment-success" className="font-mono text-sm text-green-500 font-bold">PAYMENT SUCCESSFUL</p>
                  <p className="text-2xl font-mono font-bold mt-2">₹{lastPayment.amount.toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground mt-1 font-mono">from {lastPayment.user_name}</p>
                </div>
              )}
              {scanStatus === "FAILED" && (
                <div className="text-center py-4">
                  <XCircle className="w-12 h-12 text-destructive mx-auto mb-3" />
                  <p data-testid="status-payment-failed" className="font-mono text-sm text-destructive font-bold">PAYMENT FAILED</p>
                  <p className="text-xs text-muted-foreground mt-1">Biometric not found or insufficient balance</p>
                </div>
              )}
            </Card>
          </div>

          {/* Earnings + History */}
          <div className="space-y-4">
            {/* Earnings Summary */}
            <div className="grid grid-cols-2 gap-3">
              <Card className="p-4 border-border">
                <p className="text-xs font-mono text-muted-foreground">TODAY</p>
                <p data-testid="text-today-earnings" className="text-2xl font-mono font-bold mt-1">₹{(earnings?.today_earnings ?? 0).toFixed(0)}</p>
                <p className="text-xs text-muted-foreground font-mono">{earnings?.today_count ?? 0} transactions</p>
              </Card>
              <Card className="p-4 border-border">
                <p className="text-xs font-mono text-muted-foreground">THIS WEEK</p>
                <p className="text-2xl font-mono font-bold mt-1">₹{(earnings?.weekly_earnings ?? 0).toFixed(0)}</p>
                <p className="text-xs text-muted-foreground font-mono">weekly total</p>
              </Card>
              <Card className="p-4 border-border col-span-2">
                <p className="text-xs font-mono text-muted-foreground">ALL TIME EARNINGS</p>
                <p data-testid="text-total-earnings" className="text-3xl font-mono font-bold mt-1 text-primary">₹{(earnings?.total_earnings ?? 0).toFixed(2)}</p>
                <p className="text-xs text-muted-foreground font-mono">{earnings?.total_count ?? 0} total transactions</p>
              </Card>
            </div>

            {/* Recent Transactions */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4 text-muted-foreground" />
                <h2 className="font-mono text-xs font-bold text-muted-foreground">RECENT TRANSACTIONS</h2>
              </div>
              <Card className="border-border overflow-hidden">
                {txData?.items.length === 0 ? (
                  <div className="py-10 text-center">
                    <p className="text-sm font-mono text-muted-foreground">NO TRANSACTIONS YET</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {txData?.items.map((txn) => (
                      <div key={txn.id} data-testid={`row-merchant-txn-${txn.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center ${txn.status === "SUCCESS" ? "bg-green-500/10" : "bg-destructive/10"}`}>
                            {txn.status === "SUCCESS" ? <CheckCircle className="w-3.5 h-3.5 text-green-500" /> : <XCircle className="w-3.5 h-3.5 text-destructive" />}
                          </div>
                          <div>
                            <p className="text-xs font-mono font-bold">{txn.user_name ?? "Unknown"}</p>
                            <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(txn.timestamp), { addSuffix: true })}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-mono font-bold text-sm text-green-500">+₹{txn.amount.toFixed(2)}</p>
                          <Badge variant={txn.status === "SUCCESS" ? "default" : "destructive"} className="text-xs">{txn.status}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
