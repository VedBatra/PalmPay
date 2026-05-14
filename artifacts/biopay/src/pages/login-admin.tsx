import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLoginAdmin } from "@workspace/api-client-react";
import { setAuth } from "@/lib/auth";
import { connectSocket } from "@/lib/socket";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Shield, ArrowLeft, Loader2, Lock } from "lucide-react";
import { Link } from "wouter";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
type Form = z.infer<typeof schema>;

export default function LoginAdmin() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const loginMutation = useLoginAdmin();
  const form = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });

  const handleLogin = (data: Form) => {
    loginMutation.mutate({ data }, {
      onSuccess: (res) => { setAuth(res.token, res.role); connectSocket(res.token); setLocation("/dashboard/admin"); },
      onError: (err: unknown) => toast({ title: "Access denied", description: (err as { data?: { error?: string } })?.data?.error ?? "Invalid credentials", variant: "destructive" }),
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
            <Shield className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-mono">BIOPAY</p>
            <h1 className="text-lg font-bold font-mono tracking-tight">ADMIN CONSOLE</h1>
          </div>
        </div>
        <Card className="p-6 border-border bg-card">
          <div className="flex items-center gap-2 mb-6 p-3 bg-muted/50 rounded-lg border border-border">
            <Lock className="w-4 h-4 text-muted-foreground" />
            <p className="text-xs text-muted-foreground font-mono">RESTRICTED ACCESS — AUTHORIZED PERSONNEL ONLY</p>
          </div>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleLogin)} className="space-y-4">
              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem><FormLabel className="font-mono text-xs text-muted-foreground">ADMIN EMAIL</FormLabel><FormControl><Input data-testid="input-email" placeholder="admin@biopay.dev" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="password" render={({ field }) => (
                <FormItem><FormLabel className="font-mono text-xs text-muted-foreground">PASSWORD</FormLabel><FormControl><Input data-testid="input-password" type="password" placeholder="••••••••" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <Button data-testid="button-login" type="submit" className="w-full font-mono" disabled={loginMutation.isPending}>
                {loginMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />AUTHENTICATING...</> : "ACCESS CONSOLE"}
              </Button>
            </form>
          </Form>
          <p className="text-xs text-muted-foreground text-center mt-4 font-mono">Default: admin@biopay.dev / Admin@1234</p>
        </Card>
      </div>
    </div>
  );
}
