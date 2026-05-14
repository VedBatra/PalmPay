import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLoginMerchant, useRegisterMerchant } from "@workspace/api-client-react";
import { setAuth } from "@/lib/auth";
import { connectSocket } from "@/lib/socket";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Store, ArrowLeft, Loader2 } from "lucide-react";
import { Link } from "wouter";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
const registerSchema = z.object({
  shop_name: z.string().min(1, "Shop name required"),
  email: z.string().email(),
  password: z.string().min(8, "Min. 8 characters"),
});

type LoginForm = z.infer<typeof loginSchema>;
type RegisterForm = z.infer<typeof registerSchema>;

export default function LoginMerchant() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const loginMutation = useLoginMerchant();
  const registerMutation = useRegisterMerchant();

  const loginForm = useForm<LoginForm>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });
  const registerForm = useForm<RegisterForm>({ resolver: zodResolver(registerSchema), defaultValues: { shop_name: "", email: "", password: "" } });

  const handleLogin = (data: LoginForm) => {
    loginMutation.mutate({ data }, {
      onSuccess: (res) => { setAuth(res.token, res.role); connectSocket(res.token); setLocation("/dashboard/merchant"); },
      onError: (err: unknown) => toast({ title: "Login failed", description: (err as { data?: { error?: string } })?.data?.error ?? "Invalid credentials", variant: "destructive" }),
    });
  };
  const handleRegister = (data: RegisterForm) => {
    registerMutation.mutate({ data }, {
      onSuccess: (res) => { setAuth(res.token, res.role); connectSocket(res.token); setLocation("/dashboard/merchant"); },
      onError: (err: unknown) => toast({ title: "Registration failed", description: (err as { data?: { error?: string } })?.data?.error ?? "Failed", variant: "destructive" }),
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
            <Store className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-mono">BIOPAY</p>
            <h1 className="text-lg font-bold font-mono tracking-tight">MERCHANT POS</h1>
          </div>
        </div>
        <Card className="p-6 border-border bg-card">
          <div className="flex gap-1 mb-6 p-1 bg-muted rounded-lg">
            {(["login", "register"] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)} className={`flex-1 py-1.5 text-sm font-mono rounded-md transition-colors ${mode === m ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                {m.toUpperCase()}
              </button>
            ))}
          </div>

          {mode === "login" ? (
            <Form {...loginForm}>
              <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4">
                <FormField control={loginForm.control} name="email" render={({ field }) => (
                  <FormItem><FormLabel className="font-mono text-xs text-muted-foreground">EMAIL</FormLabel><FormControl><Input data-testid="input-email" placeholder="shop@example.com" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={loginForm.control} name="password" render={({ field }) => (
                  <FormItem><FormLabel className="font-mono text-xs text-muted-foreground">PASSWORD</FormLabel><FormControl><Input data-testid="input-password" type="password" placeholder="••••••••" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <Button data-testid="button-login" type="submit" className="w-full font-mono" disabled={loginMutation.isPending}>
                  {loginMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />CONNECTING...</> : "OPEN POS"}
                </Button>
              </form>
            </Form>
          ) : (
            <Form {...registerForm}>
              <form onSubmit={registerForm.handleSubmit(handleRegister)} className="space-y-4">
                <FormField control={registerForm.control} name="shop_name" render={({ field }) => (
                  <FormItem><FormLabel className="font-mono text-xs text-muted-foreground">SHOP NAME</FormLabel><FormControl><Input data-testid="input-shop-name" placeholder="My Store" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={registerForm.control} name="email" render={({ field }) => (
                  <FormItem><FormLabel className="font-mono text-xs text-muted-foreground">EMAIL</FormLabel><FormControl><Input data-testid="input-email" placeholder="shop@example.com" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={registerForm.control} name="password" render={({ field }) => (
                  <FormItem><FormLabel className="font-mono text-xs text-muted-foreground">PASSWORD</FormLabel><FormControl><Input data-testid="input-password" type="password" placeholder="Min. 8 characters" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <Button data-testid="button-register" type="submit" className="w-full font-mono" disabled={registerMutation.isPending}>
                  {registerMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />REGISTERING...</> : "REGISTER SHOP"}
                </Button>
              </form>
            </Form>
          )}
        </Card>
      </div>
    </div>
  );
}
