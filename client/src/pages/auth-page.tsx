import { useState } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation, Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { BrandWordmark } from "@/components/brand-wordmark";

export default function AuthPage() {
  const [location] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const defaultTab = searchParams.get("tab") || "login";
  
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const [regFirstName, setRegFirstName] = useState("");
  const [regLastName, setRegLastName] = useState("");
  const [regUsername, setRegUsername] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regLoading, setRegLoading] = useState(false);

  const [testUserLoading, setTestUserLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: loginUsername, password: loginPassword }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Login failed");
      }
      const data = await res.json();
      localStorage.setItem("isLoggedIn", "true");
      localStorage.setItem("userId", String(data.id));
      localStorage.setItem("username", data.username);
      setLocation("/");
    } catch (err: any) {
      toast({ title: "Login Failed", description: err.message, variant: "destructive" });
    } finally {
      setLoginLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: regUsername, password: regPassword }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Registration failed");
      }
      const data = await res.json();
      localStorage.setItem("isLoggedIn", "true");
      localStorage.setItem("userId", String(data.id));
      localStorage.setItem("username", data.username);
      localStorage.setItem("regFirstName", regFirstName);
      localStorage.setItem("regLastName", regLastName);
      setLocation("/profile-setup");
    } catch (err: any) {
      toast({ title: "Registration Failed", description: err.message, variant: "destructive" });
    } finally {
      setRegLoading(false);
    }
  };

  const handleTestUser = async () => {
    setTestUserLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "niraj_suresh", password: "password" }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Login failed");
      }
      const data = await res.json();
      localStorage.setItem("isLoggedIn", "true");
      localStorage.setItem("userId", String(data.id));
      localStorage.setItem("username", data.username);
      setLocation("/");
    } catch (err: any) {
      toast({ title: "Test Login Failed", description: err.message, variant: "destructive" });
    } finally {
      setTestUserLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-2">
      <div className="hidden md:block relative h-full bg-primary overflow-hidden">
        <div className="absolute inset-0">
          <img 
            src="/images/hero-piano-studio.png" 
            alt="Piano Studio" 
            className="w-full h-full object-cover opacity-80 mix-blend-overlay"
          />
        </div>
        <div className="relative z-10 h-full flex flex-col justify-between p-12 text-white">
          <Link href="/">
            <div className="flex items-center cursor-pointer py-1">
              <BrandWordmark inverse size="lg" />
            </div>
          </Link>
          <blockquote className="max-w-md">
            <p className="text-3xl leading-relaxed mb-6">
              "Music is the silence between the notes."
            </p>
            <footer className="text-sm uppercase tracking-widest opacity-70">— Claude Debussy</footer>
          </blockquote>
        </div>
      </div>

      <div className="flex items-center justify-center p-6 md:p-12 bg-background">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center md:hidden mb-8">
            <Link href="/">
              <div className="flex justify-center py-1">
                <BrandWordmark size="lg" />
              </div>
            </Link>
          </div>

          <Tabs defaultValue={defaultTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-8 bg-muted/50 p-1">
              <TabsTrigger value="login" data-testid="tab-login" className="text-lg">Log In</TabsTrigger>
              <TabsTrigger value="register" data-testid="tab-register" className="text-lg">Sign Up</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <Card className="border-0 shadow-none bg-transparent">
                <CardHeader className="px-0 pt-0">
                  <CardTitle className="font-serif text-3xl mb-2">Welcome Back</CardTitle>
                  <CardDescription>Enter your credentials to access your repertoire.</CardDescription>
                </CardHeader>
                <CardContent className="px-0 space-y-4">
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="username">Username</Label>
                      <Input
                        id="username"
                        data-testid="input-login-username"
                        type="text"
                        placeholder="your_username"
                        required
                        className="h-12 bg-white/50"
                        value={loginUsername}
                        onChange={(e) => setLoginUsername(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="password">Password</Label>
                        <Link href="#" className="text-xs text-primary underline-offset-4 hover:underline">Forgot password?</Link>
                      </div>
                      <Input
                        id="password"
                        data-testid="input-login-password"
                        type="password"
                        required
                        className="h-12 bg-white/50"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                      />
                    </div>
                    <Button
                      type="submit"
                      data-testid="button-login"
                      className="w-full h-12 text-lg font-medium mt-6"
                      disabled={loginLoading}
                    >
                      {loginLoading ? "Logging in..." : "Log In"}
                    </Button>
                  </form>

                  <div className="relative my-6">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-background px-2 text-muted-foreground">or</span>
                    </div>
                  </div>

                  <Button
                    type="button"
                    data-testid="button-test-user"
                    variant="outline"
                    className="w-full h-12 text-lg font-medium border-2 border-primary/30 hover:border-primary/60 hover:bg-primary/5"
                    onClick={handleTestUser}
                    disabled={testUserLoading}
                  >
                    {testUserLoading ? "Logging in..." : "Continue as Test User"}
                  </Button>
                  <p className="text-center text-xs text-muted-foreground mt-2">
                    Explore the app as Niraj Suresh with a pre-built repertoire
                  </p>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="register">
              <Card className="border-0 shadow-none bg-transparent">
                <CardHeader className="px-0 pt-0">
                  <CardTitle className="font-serif text-3xl mb-2">Create Account</CardTitle>
                  <CardDescription>Join the community of serious musicians.</CardDescription>
                </CardHeader>
                <CardContent className="px-0 space-y-4">
                  <form onSubmit={handleRegister} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="first-name">First Name</Label>
                        <Input
                          id="first-name"
                          data-testid="input-reg-firstname"
                          required
                          className="h-12 bg-white/50"
                          value={regFirstName}
                          onChange={(e) => setRegFirstName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="last-name">Last Name</Label>
                        <Input
                          id="last-name"
                          data-testid="input-reg-lastname"
                          required
                          className="h-12 bg-white/50"
                          value={regLastName}
                          onChange={(e) => setRegLastName(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reg-username">Username</Label>
                      <Input
                        id="reg-username"
                        data-testid="input-reg-username"
                        type="text"
                        required
                        className="h-12 bg-white/50"
                        value={regUsername}
                        onChange={(e) => setRegUsername(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reg-password">Password</Label>
                      <Input
                        id="reg-password"
                        data-testid="input-reg-password"
                        type="password"
                        required
                        className="h-12 bg-white/50"
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                      />
                    </div>
                    <Button
                      type="submit"
                      data-testid="button-register"
                      className="w-full h-12 text-lg font-medium mt-6"
                      disabled={regLoading}
                    >
                      {regLoading ? "Creating Account..." : "Create Account"}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}