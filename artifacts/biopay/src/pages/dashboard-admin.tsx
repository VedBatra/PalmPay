import { useState } from "react";
import { useLocation } from "wouter";
import {
  useGetAdminStats,
  useGetAdminUsers,
  useGetAdminMerchants,
  useGetAdminTransactions,
  useGetHardwareStatus,
  useLogout,
} from "@workspace/api-client-react";
import { clearAuth } from "@/lib/auth";
import { disconnectSocket } from "@/lib/socket";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield, LogOut, Users, Store, TrendingUp, Cpu, Search, CheckCircle, XCircle, Circle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type Tab = "users" | "merchants" | "transactions" | "hardware";

export default function DashboardAdmin() {
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<Tab>("users");
  const [userSearch, setUserSearch] = useState("");
  const [merchantSearch, setMerchantSearch] = useState("");
  const [txType, setTxType] = useState<"" | "TOPUP" | "PURCHASE">("");
  const [userPage, setUserPage] = useState(1);
  const [merchantPage, setMerchantPage] = useState(1);
  const [txPage, setTxPage] = useState(1);
  const logoutMutation = useLogout();

  const { data: stats, isLoading: statsLoading } = useGetAdminStats();
  const { data: users, isLoading: usersLoading } = useGetAdminUsers({ page: userPage, limit: 20, search: userSearch || undefined });
  const { data: merchants, isLoading: merchantsLoading } = useGetAdminMerchants({ page: merchantPage, limit: 20, search: merchantSearch || undefined });
  const { data: txData, isLoading: txLoading } = useGetAdminTransactions({ page: txPage, limit: 50, type: txType || undefined });
  const { data: hardware, isLoading: hwLoading } = useGetHardwareStatus();

  const handleLogout = () => {
    logoutMutation.mutate(undefined, { onSettled: () => { clearAuth(); disconnectSocket(); setLocation("/"); } });
  };

  const kpiCards = [
    { label: "TOTAL USERS", value: stats?.total_users ?? 0, icon: Users, color: "text-primary" },
    { label: "MERCHANTS", value: stats?.total_merchants ?? 0, icon: Store, color: "text-blue-400" },
    { label: "TOTAL VOLUME", value: `₹${(stats?.total_volume ?? 0).toLocaleString("en-IN")}`, icon: TrendingUp, color: "text-green-500" },
    { label: "TRANSACTIONS", value: stats?.total_transactions ?? 0, icon: TrendingUp, color: "text-purple-400" },
    { label: "ACTIVE KIOSKS", value: stats?.active_kiosks ?? 0, icon: Cpu, color: "text-yellow-500" },
    { label: "FAILED TXN", value: stats?.failed_transactions ?? 0, icon: XCircle, color: "text-destructive" },
  ];

  const tabs: Tab[] = ["users", "merchants", "transactions", "hardware"];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            <span className="font-mono font-bold text-sm tracking-tight">BIOPAY / ADMIN CONSOLE</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-xs font-mono text-muted-foreground px-2 py-1 border border-border rounded">
              TODAY ₹{(stats?.today_volume ?? 0).toFixed(0)} — {stats?.today_transactions ?? 0} txn
            </div>
            <Button variant="outline" size="sm" onClick={handleLogout} className="font-mono text-xs gap-1">
              <LogOut className="w-3 h-3" /> LOGOUT
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {kpiCards.map(({ label, value, icon: Icon, color }) => (
            <Card key={label} className="p-4 border-border">
              <div className="flex items-start justify-between mb-2">
                <p className="text-xs font-mono text-muted-foreground leading-tight">{label}</p>
                <Icon className={`w-4 h-4 ${color} flex-shrink-0`} />
              </div>
              {statsLoading ? <Skeleton className="h-7 w-16" /> : (
                <p data-testid={`kpi-${label.toLowerCase().replace(/\s/g, "-")}`} className={`text-xl font-mono font-bold ${color}`}>{value}</p>
              )}
            </Card>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
          {tabs.map((t) => (
            <button
              key={t}
              data-testid={`tab-${t}`}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 text-xs font-mono rounded-md transition-colors ${tab === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Users Tab */}
        {tab === "users" && (
          <div className="space-y-3">
            <div className="relative max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input data-testid="input-user-search" placeholder="Search users..." value={userSearch} onChange={(e) => { setUserSearch(e.target.value); setUserPage(1); }} className="pl-9 font-mono text-sm" />
            </div>
            <Card className="border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    {["ID", "NAME", "EMAIL", "BALANCE", "BIOMETRIC", "VERIFIED"].map((h) => (
                      <th key={h} className="text-left px-4 py-2 text-xs font-mono text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {usersLoading ? (
                    <tr><td colSpan={6} className="px-4 py-8 text-center"><Skeleton className="h-4 w-48 mx-auto" /></td></tr>
                  ) : users?.items.map((u) => (
                    <tr key={u.id} data-testid={`row-user-${u.id}`} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2 font-mono text-xs text-muted-foreground">#{u.id}</td>
                      <td className="px-4 py-2 font-mono font-bold text-sm">{u.name}</td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">{u.email}</td>
                      <td className="px-4 py-2 font-mono font-bold text-primary">₹{u.wallet_balance.toFixed(2)}</td>
                      <td className="px-4 py-2">{u.biometric_enrolled ? <Badge variant="default" className="text-xs">ENROLLED</Badge> : <Badge variant="outline" className="text-xs">NONE</Badge>}</td>
                      <td className="px-4 py-2">{u.is_verified ? <CheckCircle className="w-4 h-4 text-green-500" /> : <Circle className="w-4 h-4 text-muted-foreground/40" />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {users && users.total > users.limit && (
                <div className="flex items-center justify-between px-4 py-2 border-t border-border">
                  <p className="text-xs text-muted-foreground font-mono">{users.total} total</p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setUserPage((p) => Math.max(1, p - 1))} disabled={userPage === 1} className="font-mono text-xs">PREV</Button>
                    <Button variant="outline" size="sm" onClick={() => setUserPage((p) => p + 1)} disabled={userPage * users.limit >= users.total} className="font-mono text-xs">NEXT</Button>
                  </div>
                </div>
              )}
            </Card>
          </div>
        )}

        {/* Merchants Tab */}
        {tab === "merchants" && (
          <div className="space-y-3">
            <div className="relative max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input data-testid="input-merchant-search" placeholder="Search merchants..." value={merchantSearch} onChange={(e) => { setMerchantSearch(e.target.value); setMerchantPage(1); }} className="pl-9 font-mono text-sm" />
            </div>
            <Card className="border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    {["ID", "SHOP", "EMAIL", "BALANCE", "KIOSK ID", "STATUS"].map((h) => (
                      <th key={h} className="text-left px-4 py-2 text-xs font-mono text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {merchantsLoading ? (
                    <tr><td colSpan={6} className="px-4 py-8 text-center"><Skeleton className="h-4 w-48 mx-auto" /></td></tr>
                  ) : merchants?.items.map((m) => (
                    <tr key={m.id} data-testid={`row-merchant-${m.id}`} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2 font-mono text-xs text-muted-foreground">#{m.id}</td>
                      <td className="px-4 py-2 font-mono font-bold text-sm">{m.shop_name}</td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">{m.email}</td>
                      <td className="px-4 py-2 font-mono font-bold text-green-500">₹{m.merchant_balance.toFixed(2)}</td>
                      <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{m.kiosk_id}</td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1.5">
                          <div className={`w-2 h-2 rounded-full ${m.is_online ? "bg-primary animate-pulse" : "bg-muted-foreground/40"}`} />
                          <span className={`text-xs font-mono ${m.is_online ? "text-primary" : "text-muted-foreground"}`}>{m.is_online ? "ONLINE" : "OFFLINE"}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
        )}

        {/* Transactions Tab */}
        {tab === "transactions" && (
          <div className="space-y-3">
            <div className="flex gap-2">
              {(["", "TOPUP", "PURCHASE"] as const).map((t) => (
                <button key={t} onClick={() => { setTxType(t); setTxPage(1); }} className={`px-3 py-1.5 text-xs font-mono rounded-md border transition-colors ${txType === t ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
                  {t || "ALL"}
                </button>
              ))}
            </div>
            <Card className="border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    {["ID", "TYPE", "AMOUNT", "USER", "MERCHANT", "STATUS", "TIME"].map((h) => (
                      <th key={h} className="text-left px-4 py-2 text-xs font-mono text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {txLoading ? (
                    <tr><td colSpan={7} className="px-4 py-8 text-center"><Skeleton className="h-4 w-48 mx-auto" /></td></tr>
                  ) : txData?.items.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-12 text-center text-xs font-mono text-muted-foreground">NO TRANSACTIONS</td></tr>
                  ) : txData?.items.map((txn) => (
                    <tr key={txn.id} data-testid={`row-admin-txn-${txn.id}`} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2 font-mono text-xs text-muted-foreground">#{txn.id}</td>
                      <td className="px-4 py-2"><Badge variant="outline" className="text-xs font-mono">{txn.type}</Badge></td>
                      <td className="px-4 py-2 font-mono font-bold text-sm">₹{txn.amount.toFixed(2)}</td>
                      <td className="px-4 py-2 text-xs">{txn.user_name ?? "—"}</td>
                      <td className="px-4 py-2 text-xs">{txn.merchant_name ?? "—"}</td>
                      <td className="px-4 py-2">
                        {txn.status === "SUCCESS"
                          ? <Badge className="text-xs bg-green-500/10 text-green-500 border-green-500/20">SUCCESS</Badge>
                          : <Badge variant="destructive" className="text-xs">FAILED</Badge>}
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">{formatDistanceToNow(new Date(txn.timestamp), { addSuffix: true })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {txData && txData.total > txData.limit && (
                <div className="flex items-center justify-between px-4 py-2 border-t border-border">
                  <p className="text-xs text-muted-foreground font-mono">{txData.total} total</p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setTxPage((p) => Math.max(1, p - 1))} disabled={txPage === 1} className="font-mono text-xs">PREV</Button>
                    <Button variant="outline" size="sm" onClick={() => setTxPage((p) => p + 1)} disabled={txPage * txData.limit >= txData.total} className="font-mono text-xs">NEXT</Button>
                  </div>
                </div>
              )}
            </Card>
          </div>
        )}

        {/* Hardware Tab */}
        {tab === "hardware" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {hwLoading ? (
              [1, 2, 3].map((i) => <Skeleton key={i} className="h-32 w-full rounded-lg" />)
            ) : hardware?.length === 0 ? (
              <Card className="col-span-3 p-12 text-center border-border">
                <Cpu className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm font-mono text-muted-foreground">NO KIOSKS REGISTERED</p>
              </Card>
            ) : hardware?.map((kiosk) => (
              <Card key={kiosk.kiosk_id} data-testid={`card-kiosk-${kiosk.kiosk_id}`} className={`p-5 border transition-all ${kiosk.is_online ? "border-primary/30" : "border-border"}`}>
                <div className="flex items-start justify-between mb-3">
                  <Cpu className="w-6 h-6 text-muted-foreground" />
                  <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-mono ${kiosk.is_online ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${kiosk.is_online ? "bg-primary animate-pulse" : "bg-muted-foreground"}`} />
                    {kiosk.is_online ? "ONLINE" : "OFFLINE"}
                  </div>
                </div>
                <p className="font-mono font-bold text-sm">{kiosk.shop_name}</p>
                <p className="text-xs text-muted-foreground font-mono mt-0.5">{kiosk.kiosk_id}</p>
                {kiosk.last_seen && (
                  <p className="text-xs text-muted-foreground mt-2">{formatDistanceToNow(new Date(kiosk.last_seen), { addSuffix: true })}</p>
                )}
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
