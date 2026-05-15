import { useState } from "react";
import { useLoginUser, useRegisterUser } from "@workspace/api-client-react";
import { setAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Hand, ArrowLeft, Loader2 } from "lucide-react";
import { Link } from "wouter";

export default function LoginUser() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const { toast } = useToast();
  const loginMutation = useLoginUser();
  const registerMutation = useRegisterUser();

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");

  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!loginEmail) errs.loginEmail = "Email is required";
    if (!loginPassword) errs.loginPassword = "Password is required";
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    loginMutation.mutate({ data: { email: loginEmail, password: loginPassword } }, {
      onSuccess: (res) => {
        setAuth(res.token, res.role);
        window.location.replace("/dashboard/user");
      },
      onError: (err: unknown) => {
        const message = (err as { data?: { error?: string } })?.data?.error ?? "Login failed";
        toast({ title: "Login failed", description: message, variant: "destructive" });
      },
    });
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!regName.trim()) errs.regName = "Name is required";
    if (!regEmail.trim()) errs.regEmail = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(regEmail)) errs.regEmail = "Enter a valid email";
    if (!regPassword) errs.regPassword = "Password is required";
    else if (regPassword.length < 8) errs.regPassword = "Password must be at least 8 characters";
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    registerMutation.mutate({ data: { name: regName.trim(), email: regEmail.trim(), password: regPassword } }, {
      onSuccess: (res) => {
        setAuth(res.token, res.role);
        window.location.replace("/dashboard/user");
      },
      onError: (err: unknown) => {
        const message = (err as { data?: { error?: string } })?.data?.error ?? "Registration failed";
        toast({ title: "Registration failed", description: message, variant: "destructive" });
      },
    });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />
      <div className="z-10 w-full max-w-sm">
        <Link href="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8 transition-colors text-sm">
          <ArrowLeft className="w-4 h-4" /> Back to home
        </Link>
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Hand className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-mono">BIOPAY</p>
            <h1 className="text-lg font-bold font-mono tracking-tight">USER TERMINAL</h1>
          </div>
        </div>

        <Card className="p-6 border-border bg-card">
          <div className="flex gap-1 mb-6 p-1 bg-muted rounded-lg">
            <button
              onClick={() => { setMode("login"); setErrors({}); }}
              className={`flex-1 py-1.5 text-sm font-mono rounded-md transition-colors ${mode === "login" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              LOGIN
            </button>
            <button
              onClick={() => { setMode("register"); setErrors({}); }}
              className={`flex-1 py-1.5 text-sm font-mono rounded-md transition-colors ${mode === "register" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              REGISTER
            </button>
          </div>

          {mode === "login" ? (
            <form onSubmit={handleLogin} className="space-y-4" noValidate>
              <div className="space-y-1">
                <label className="font-mono text-xs text-muted-foreground">EMAIL</label>
                <Input
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                />
                {errors.loginEmail && <p className="text-xs text-destructive">{errors.loginEmail}</p>}
              </div>
              <div className="space-y-1">
                <label className="font-mono text-xs text-muted-foreground">PASSWORD</label>
                <Input
                  type="password"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                />
                {errors.loginPassword && <p className="text-xs text-destructive">{errors.loginPassword}</p>}
              </div>
              <Button type="submit" className="w-full font-mono" disabled={loginMutation.isPending}>
                {loginMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />AUTHENTICATING...</> : "ACCESS TERMINAL"}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4" noValidate>
              <div className="space-y-1">
                <label className="font-mono text-xs text-muted-foreground">FULL NAME</label>
                <Input
                  type="text"
                  placeholder="John Doe"
                  autoComplete="off"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                />
                {errors.regName && <p className="text-xs text-destructive">{errors.regName}</p>}
              </div>
              <div className="space-y-1">
                <label className="font-mono text-xs text-muted-foreground">EMAIL</label>
                <Input
                  type="text"
                  placeholder="you@example.com"
                  autoComplete="off"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                />
                {errors.regEmail && <p className="text-xs text-destructive">{errors.regEmail}</p>}
              </div>
              <div className="space-y-1">
                <label className="font-mono text-xs text-muted-foreground">PASSWORD</label>
                <Input
                  type="password"
                  placeholder="Min. 8 characters"
                  autoComplete="new-password"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                />
                {errors.regPassword && <p className="text-xs text-destructive">{errors.regPassword}</p>}
              </div>
              <Button type="submit" className="w-full font-mono" disabled={registerMutation.isPending}>
                {registerMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />CREATING...</> : "CREATE ACCOUNT"}
              </Button>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
