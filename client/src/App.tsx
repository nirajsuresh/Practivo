import { useLayoutEffect } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import LandingPage from "@/pages/landing-page";
import HomePage from "@/pages/home-page";
import AuthPage from "@/pages/auth-page";
import ProfileSetup from "@/pages/profile-setup";
import PieceDetailPage from "@/pages/piece-detail";
import SearchPage from "@/pages/search-page";
import ComposerPage from "@/pages/composer-page";
import PlanPage from "@/pages/plan-page";
import SessionPage from "@/pages/session-page";

/** Signed-in dashboard (Active Learning Plans, repertoire); signed-out marketing. */
function RootPage() {
  const [location] = useLocation();
  void location;
  const userId = typeof window !== "undefined" ? localStorage.getItem("userId") : null;
  if (!userId) return <LandingPage />;
  return <HomePage />;
}

function ProfileRedirect() {
  const [, setLocation] = useLocation();
  useLayoutEffect(() => {
    setLocation("/");
  }, [setLocation]);
  return null;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={RootPage} />
      <Route path="/auth" component={AuthPage} />
      <Route path="/profile-setup" component={ProfileSetup} />
      <Route path="/profile" component={ProfileRedirect} />
      <Route path="/plan/:planId" component={PlanPage} />
      <Route path="/session/:lessonId" component={SessionPage} />
      <Route path="/piece/:id" component={PieceDetailPage} />
      <Route path="/composer/:id" component={ComposerPage} />
      <Route path="/search" component={SearchPage} />
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