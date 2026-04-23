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
import PieceDetailPage from "@/pages/piece-detail";
import SearchPage from "@/pages/search-page";
import ComposerPage from "@/pages/composer-page";
import PlanPage from "@/pages/plan-page";
import SessionPage from "@/pages/session-page";
import PracticePage from "@/pages/practice-page";
import ScorePage from "@/pages/score-page";

function isLoggedIn() {
  return typeof window !== "undefined" && !!localStorage.getItem("userId");
}

/** Redirects to `to` using wouter, rendering nothing meanwhile. */
function Redirect({ to }: { to: string }) {
  const [, setLocation] = useLocation();
  useLayoutEffect(() => { setLocation(to); }, [to, setLocation]);
  return null;
}

/** Renders children only when logged in; otherwise redirects to /auth. */
function Protected({ component: Component }: { component: React.ComponentType }) {
  const [, setLocation] = useLocation();
  const loggedIn = isLoggedIn();
  useLayoutEffect(() => {
    if (!loggedIn) setLocation("/auth");
  }, [loggedIn, setLocation]);
  if (!loggedIn) return null;
  return <Component />;
}

/** Renders children only when logged OUT; otherwise redirects to /home. */
function PublicOnly({ component: Component }: { component: React.ComponentType }) {
  const [, setLocation] = useLocation();
  const loggedIn = isLoggedIn();
  useLayoutEffect(() => {
    if (loggedIn) setLocation("/home");
  }, [loggedIn, setLocation]);
  if (loggedIn) return null;
  return <Component />;
}

function Router() {
  return (
    <Switch>
      {/* Root: landing for logged-out, redirect to /home if logged in */}
      <Route path="/">
        {isLoggedIn() ? <Redirect to="/home" /> : <LandingPage />}
      </Route>

      {/* Auth page: only when logged out */}
      <Route path="/auth">
        <PublicOnly component={AuthPage} />
      </Route>

      {/* Home dashboard: protected */}
      <Route path="/home">
        <Protected component={HomePage} />
      </Route>

      {/* Feature pages: all protected */}
      <Route path="/plan/:planId">
        <Protected component={PlanPage} />
      </Route>
      <Route path="/session/:lessonId">
        <Protected component={SessionPage} />
      </Route>
      <Route path="/practice">
        <Protected component={PracticePage} />
      </Route>
      <Route path="/score/:sheetMusicId">
        <Protected component={ScorePage} />
      </Route>
      <Route path="/piece/:id">
        <Protected component={PieceDetailPage} />
      </Route>
      <Route path="/composer/:id">
        <Protected component={ComposerPage} />
      </Route>
      <Route path="/search">
        <Protected component={SearchPage} />
      </Route>

      {/* Legacy redirects */}
      <Route path="/profile"><Redirect to="/home" /></Route>
      <Route path="/landing"><Redirect to="/" /></Route>

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
