import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import LandingPage from "@/pages/landing-page";
import AuthPage from "@/pages/auth-page";
import ProfileSetup from "@/pages/profile-setup";
import ProfilePage from "@/pages/profile-page";
import PieceDetailPage from "@/pages/piece-detail";
import SearchPage from "@/pages/search-page";
import UserProfilePage from "@/pages/user-profile";

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/auth" component={AuthPage} />
      <Route path="/profile-setup" component={ProfileSetup} />
      <Route path="/profile" component={ProfilePage} />
      <Route path="/piece/:id" component={PieceDetailPage} />
      <Route path="/search" component={SearchPage} />
      <Route path="/user/:id" component={UserProfilePage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;