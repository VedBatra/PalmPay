import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLoginUser, useRegisterUser } from "@workspace/api-client-react";
import { setAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Hand, ArrowLeft, Loader2 } from "lucide-react";
import { Link } from "wouter";

const loginSchema = z.object({
  email: z.string().email("Valid email required"),
  password: z.string().min(1, "Password required"),
});

const registerSchema = z.object({
  name: z.string().min(1, "Name required"),
  email: z.string().email("Valid email required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type LoginForm = z.infer<typeof loginSchema>;
type RegisterForm = z.infer<typeof registerSchema>;

export default function LoginUser() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const { toast } = useToast();
  const loginMutation = useLoginUser();
  const registerMutation = useRegisterUser();

  const loginForm = useForm<LoginForm>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });
  const registerForm = useForm<RegisterForm>({ resolver: zodResolver(registerSchema), defaultValues: { name: "", email: "", password: "" } });

  const handleLogin = (data: LoginForm) => {
    loginMutation.mutate({ data }, {
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

  const handleRegister = (data: RegisterForm) => {
    registerMutation.mutate({ data }, {
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
              data-testid="tab-login"
              onClick={() => setMode("login")}
              className={`flex-1 py-1.5 text-sm font-mono rounded-md transition-colors ${mode === "login" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              LOGIN
            </button>
            <button
              data-testid="tab-register"
              onClick={() => setMode("register")}
              className={`flex-1 py-1.5 text-sm font-mono rounded-md transition-colors ${mode === "register" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              REGISTER
            </button>
          </div>

          {mode === "login" ? (
            <Form {...loginForm}>
              <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4">
                <FormField control={loginForm.control} name="email" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-mono text-xs text-muted-foreground">EMAIL</FormLabel>
                    <FormControl><Input data-testid="input-email" placeholder="you@example.com" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={loginForm.control} name="password" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-mono text-xs text-muted-foreground">PASSWORD</FormLabel>
                    <FormControl><Input data-testid="input-password" type="password" placeholder="••••••••" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <Button data-testid="button-login" type="submit" className="w-full font-mono" disabled={loginMutation.isPending}>
                  {loginMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />AUTHENTICATING...</> : "ACCESS TERMINAL"}
                </Button>
              </form>
            </Form>
          ) : (
            <Form {...registerForm}>
              <form onSubmit={registerForm.handleSubmit(handleRegister)} className="space-y-4">
                <FormField control={registerForm.control} name="name" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-mono text-xs text-muted-foreground">FULL NAME</FormLabel>
                    <FormControl><Input data-testid="input-name" placeholder="John Doe" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={registerForm.control} name="email" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-mono text-xs text-muted-foreground">EMAIL</FormLabel>
                    <FormControl><Input data-testid="input-email" placeholder="you@example.com" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={registerForm.control} name="password" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-mono text-xs text-muted-foreground">PASSWORD</FormLabel>
                    <FormControl><Input data-testid="input-password" type="password" placeholder="Min. 8 characters" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <Button data-testid="button-register" type="submit" className="w-full font-mono" disabled={registerMutation.isPending}>
                  {registerMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />CREATING...</> : "CREATE ACCOUNT"}
                </Button>
              </form>
            </Form>
          )}
        </Card>
      </div>
    </div>
  );
}
