import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect } from "react";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { getToken, getRole } from "@/lib/auth";
import { connectSocket, disconnectSocket } from "@/lib/socket";

import Landing from "@/pages/landing";
import LoginUser from "@/pages/login-user";
import LoginMerchant from "@/pages/login-merchant";
import LoginAdmin from "@/pages/login-admin";
import DashboardUser from "@/pages/dashboard-user";
import DashboardMerchant from "@/pages/dashboard-merchant";
import DashboardAdmin from "@/pages/dashboard-admin";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

setAuthTokenGetter(() => getToken());

function Router() {
  const [location, setLocation] = useLocation();

  useEffect(() => {
    const token = getToken();
    const role = getRole();

    if (token && role) {
      connectSocket(token);
      if (location === "/" || location.startsWith("/login")) {
        setLocation(`/dashboard/${role}`);
      } else if (location.startsWith("/dashboard/")) {
        const expectedRole = location.split("/")[2]; // e.g. "user" or "merchant" or "admin"
        if (role !== expectedRole) {
          setLocation(`/login/${expectedRole}`);
        }
      }
    } else {
      disconnectSocket();
      if (location.startsWith("/dashboard")) {
        setLocation("/");
      }
    }
  }, [location, setLocation]);

  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/login/user" component={LoginUser} />
      <Route path="/login/merchant" component={LoginMerchant} />
      <Route path="/login/admin" component={LoginAdmin} />
      <Route path="/dashboard/user" component={DashboardUser} />
      <Route path="/dashboard/merchant" component={DashboardMerchant} />
      <Route path="/dashboard/admin" component={DashboardAdmin} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
