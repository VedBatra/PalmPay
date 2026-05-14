import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Hand, Store, Shield } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-background text-foreground relative overflow-hidden">
      {/* Abstract Grid Background */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />

      <div className="z-10 text-center mb-16 max-w-2xl px-4">
        <h1 className="text-5xl md:text-7xl font-mono font-bold tracking-tighter mb-4 text-primary">
          BIOPAY
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground max-w-lg mx-auto">
          Subsurface Palm Vein Biometric Payment System. 
          Frictionless, secure, real-time transaction processing.
        </p>
      </div>

      <div className="z-10 grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl px-4">
        <Link href="/login/user" className="block focus:outline-none group">
          <Card className="h-full p-8 flex flex-col items-center justify-center border-border bg-card hover:border-primary/50 transition-colors duration-300">
            <Hand className="w-12 h-12 mb-6 text-primary group-hover:scale-110 transition-transform duration-300" />
            <h2 className="text-xl font-bold font-mono tracking-tight mb-2">USER TERMINAL</h2>
            <p className="text-sm text-muted-foreground text-center">
              Manage wallet, enroll biometrics, view history.
            </p>
          </Card>
        </Link>

        <Link href="/login/merchant" className="block focus:outline-none group">
          <Card className="h-full p-8 flex flex-col items-center justify-center border-border bg-card hover:border-primary/50 transition-colors duration-300">
            <Store className="w-12 h-12 mb-6 text-primary group-hover:scale-110 transition-transform duration-300" />
            <h2 className="text-xl font-bold font-mono tracking-tight mb-2">MERCHANT POS</h2>
            <p className="text-sm text-muted-foreground text-center">
              Initiate payments, view real-time status, manage kiosk.
            </p>
          </Card>
        </Link>

        <Link href="/login/admin" className="block focus:outline-none group">
          <Card className="h-full p-8 flex flex-col items-center justify-center border-border bg-card hover:border-primary/50 transition-colors duration-300">
            <Shield className="w-12 h-12 mb-6 text-primary group-hover:scale-110 transition-transform duration-300" />
            <h2 className="text-xl font-bold font-mono tracking-tight mb-2">ADMIN CONSOLE</h2>
            <p className="text-sm text-muted-foreground text-center">
              System overview, fleet management, transaction logs.
            </p>
          </Card>
        </Link>
      </div>
    </div>
  );
}
