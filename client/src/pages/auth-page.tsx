import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocation, Link } from "wouter";
import { useToast } from "@/hooks/use-toast";

export default function AuthPage() {
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
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regLoading, setRegLoading] = useState(false);

  const [testUserLoading, setTestUserLoading] = useState(false);

  const storeAndRedirect = (data: { id: string; username: string; firstName?: string | null }, isNew = false) => {
    localStorage.setItem("isLoggedIn", "true");
    localStorage.setItem("userId", String(data.id));
    localStorage.setItem("username", data.username);
    if (data.firstName) localStorage.setItem("firstName", data.firstName);
    if (isNew) localStorage.setItem("isNewUser", "true");
    setLocation("/home");
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username: loginUsername, password: loginPassword }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Login failed");
      }
      storeAndRedirect(await res.json());
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
        credentials: "include",
        body: JSON.stringify({ username: regUsername, email: regEmail || undefined, firstName: regFirstName, lastName: regLastName, password: regPassword }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Registration failed");
      }
      storeAndRedirect(await res.json(), true);
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
        credentials: "include",
        body: JSON.stringify({ username: "niraj_suresh", password: "password" }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Login failed");
      }
      storeAndRedirect(await res.json());
    } catch (err: any) {
      toast({ title: "Test Login Failed", description: err.message, variant: "destructive" });
    } finally {
      setTestUserLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-2">
      {/* Left panel */}
      <div
        className="hidden md:flex flex-col justify-between p-12"
        style={{ backgroundColor: "#f5f1ea" }}
      >
        <Link href="/">
          <img src="/images/practivo-wordmark.png" alt="Practivo" style={{ height: 44, width: "auto", cursor: "pointer" }} />
        </Link>

        <div className="flex flex-col items-start gap-6 max-w-sm">
          <svg width="120" height="14" viewBox="0 0 120 14" fill="none" xmlns="http://www.w3.org/2000/svg">
            <line x1="0" y1="7" x2="50" y2="7" stroke="#0f2036" strokeOpacity="0.3" strokeWidth="1" />
            <rect x="55" y="3" width="8" height="8" transform="rotate(45 59 7)" fill="#c9a86a" />
            <line x1="68" y1="7" x2="120" y2="7" stroke="#0f2036" strokeOpacity="0.3" strokeWidth="1" />
          </svg>

          <blockquote>
            <p
              style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: "32px",
                fontStyle: "italic",
                color: "#0f2036",
                maxWidth: "400px",
                lineHeight: "1.35",
                margin: 0,
              }}
            >
              "The score is not the music."
            </p>
            <footer
              style={{
                fontFamily: "Inter, sans-serif",
                fontSize: "12px",
                textTransform: "uppercase",
                letterSpacing: "0.15em",
                color: "#7a7166",
                marginTop: "16px",
              }}
            >
              — Nadia Boulanger
            </footer>
          </blockquote>
        </div>

        <p
          style={{
            fontFamily: "'EB Garamond', Georgia, serif",
            fontSize: "14px",
            fontStyle: "italic",
            color: "#7a7166",
          }}
        >
          Practice, plotted.
        </p>
      </div>

      {/* Right panel */}
      <div
        className="flex items-center justify-center p-6 md:p-12"
        style={{ backgroundColor: "#f9f7f3" }}
      >
        <div className="w-full max-w-md">
          <div className="text-center md:hidden mb-8">
            <Link href="/">
              <img src="/images/practivo-wordmark.png" alt="Practivo" style={{ height: 40, width: "auto", cursor: "pointer", display: "inline-block" }} />
            </Link>
          </div>

          <Tabs defaultValue={defaultTab} className="w-full">
            <TabsList
              className="grid w-full grid-cols-2 mb-8"
              style={{
                background: "transparent",
                borderBottom: "1px solid #ddd8cc",
                borderRadius: 0,
                padding: 0,
                height: "auto",
              }}
            >
              <TabsTrigger
                value="login"
                data-testid="tab-login"
                style={{ fontFamily: "Inter, sans-serif", fontSize: "13px", borderRadius: 0, background: "transparent", paddingBottom: "10px" }}
                className="data-[state=active]:border-b-2 data-[state=active]:border-[#0f2036] data-[state=active]:text-[#0f2036] data-[state=active]:shadow-none data-[state=inactive]:text-[#7a7166]"
              >
                Log In
              </TabsTrigger>
              <TabsTrigger
                value="register"
                data-testid="tab-register"
                style={{ fontFamily: "Inter, sans-serif", fontSize: "13px", borderRadius: 0, background: "transparent", paddingBottom: "10px" }}
                className="data-[state=active]:border-b-2 data-[state=active]:border-[#0f2036] data-[state=active]:text-[#0f2036] data-[state=active]:shadow-none data-[state=inactive]:text-[#7a7166]"
              >
                Sign Up
              </TabsTrigger>
            </TabsList>

            {/* Login tab */}
            <TabsContent value="login">
              <div className="space-y-6">
                <div>
                  <h1
                    style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "40px", fontWeight: 400, color: "#0f2036", lineHeight: 1.1, margin: 0 }}
                  >
                    Welcome back.
                  </h1>
                  <p
                    style={{ fontFamily: "'EB Garamond', Georgia, serif", fontStyle: "italic", fontSize: "16px", color: "#7a7166", marginTop: "8px" }}
                  >
                    Enter your credentials to access your repertoire.
                  </p>
                </div>

                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-1.5">
                    <label htmlFor="username" style={{ fontFamily: "Inter, sans-serif", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.1em", color: "#7a7166", display: "block" }}>
                      Username
                    </label>
                    <Input
                      id="username"
                      data-testid="input-login-username"
                      type="text"
                      placeholder="your_username"
                      required
                      style={{ height: "44px", backgroundColor: "#ffffff", borderColor: "#ddd8cc" }}
                      className="focus-visible:ring-[#c9a86a]"
                      value={loginUsername}
                      onChange={(e) => setLoginUsername(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label htmlFor="password" style={{ fontFamily: "Inter, sans-serif", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.1em", color: "#7a7166" }}>
                        Password
                      </label>
                    </div>
                    <Input
                      id="password"
                      data-testid="input-login-password"
                      type="password"
                      required
                      style={{ height: "44px", backgroundColor: "#ffffff", borderColor: "#ddd8cc" }}
                      className="focus-visible:ring-[#c9a86a]"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                    />
                  </div>
                  <button
                    type="submit"
                    data-testid="button-login"
                    disabled={loginLoading}
                    style={{
                      width: "100%", height: "44px",
                      backgroundColor: loginLoading ? "#4a5568" : "#0f2036",
                      color: "#f5f1ea", fontFamily: "Inter, sans-serif", fontWeight: 500, fontSize: "14px",
                      borderRadius: "2px", border: "none", cursor: loginLoading ? "not-allowed" : "pointer",
                      marginTop: "8px", transition: "background-color 0.15s",
                    }}
                  >
                    {loginLoading ? "Logging in..." : "Log In"}
                  </button>
                </form>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" style={{ borderColor: "#ddd8cc" }} />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span style={{ backgroundColor: "#f9f7f3", padding: "0 8px", fontFamily: "Inter, sans-serif", fontSize: "11px", color: "#7a7166", letterSpacing: "0.1em" }}>
                      or
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <button
                    type="button"
                    data-testid="button-test-user"
                    onClick={handleTestUser}
                    disabled={testUserLoading}
                    style={{
                      width: "100%", height: "44px", backgroundColor: "transparent", color: "#0f2036",
                      fontFamily: "Inter, sans-serif", fontWeight: 500, fontSize: "14px",
                      borderRadius: "2px", border: "1px solid #ddd8cc",
                      cursor: testUserLoading ? "not-allowed" : "pointer", transition: "border-color 0.15s",
                    }}
                    onMouseEnter={(e) => { if (!testUserLoading) e.currentTarget.style.borderColor = "#0f2036"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#ddd8cc"; }}
                  >
                    {testUserLoading ? "Logging in..." : "Continue as Test User"}
                  </button>
                  <p style={{ textAlign: "center", fontFamily: "Inter, sans-serif", fontSize: "12px", color: "#7a7166" }}>
                    Explore the app as Niraj Suresh with a pre-built repertoire
                  </p>
                </div>
              </div>
            </TabsContent>

            {/* Register tab */}
            <TabsContent value="register">
              <div className="space-y-6">
                <div>
                  <h1
                    style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "40px", fontWeight: 400, color: "#0f2036", lineHeight: 1.1, margin: 0 }}
                  >
                    Create account.
                  </h1>
                  <p
                    style={{ fontFamily: "'EB Garamond', Georgia, serif", fontStyle: "italic", fontSize: "16px", color: "#7a7166", marginTop: "8px" }}
                  >
                    Join the community of serious musicians.
                  </p>
                </div>

                <form onSubmit={handleRegister} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label htmlFor="reg-first-name" style={{ fontFamily: "Inter, sans-serif", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.1em", color: "#7a7166", display: "block" }}>
                        First Name
                      </label>
                      <Input
                        id="reg-first-name"
                        data-testid="input-reg-firstname"
                        type="text"
                        required
                        style={{ height: "44px", backgroundColor: "#ffffff", borderColor: "#ddd8cc" }}
                        className="focus-visible:ring-[#c9a86a]"
                        value={regFirstName}
                        onChange={(e) => setRegFirstName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="reg-last-name" style={{ fontFamily: "Inter, sans-serif", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.1em", color: "#7a7166", display: "block" }}>
                        Last Name
                      </label>
                      <Input
                        id="reg-last-name"
                        data-testid="input-reg-lastname"
                        type="text"
                        required
                        style={{ height: "44px", backgroundColor: "#ffffff", borderColor: "#ddd8cc" }}
                        className="focus-visible:ring-[#c9a86a]"
                        value={regLastName}
                        onChange={(e) => setRegLastName(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="reg-username" style={{ fontFamily: "Inter, sans-serif", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.1em", color: "#7a7166", display: "block" }}>
                      Username
                    </label>
                    <Input
                      id="reg-username"
                      data-testid="input-reg-username"
                      type="text"
                      required
                      style={{ height: "44px", backgroundColor: "#ffffff", borderColor: "#ddd8cc" }}
                      className="focus-visible:ring-[#c9a86a]"
                      value={regUsername}
                      onChange={(e) => setRegUsername(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="reg-email" style={{ fontFamily: "Inter, sans-serif", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.1em", color: "#7a7166", display: "block" }}>
                      Email <span style={{ color: "#b0a898", textTransform: "none", letterSpacing: 0 }}>(optional — for updates)</span>
                    </label>
                    <Input
                      id="reg-email"
                      data-testid="input-reg-email"
                      type="email"
                      placeholder="you@example.com"
                      style={{ height: "44px", backgroundColor: "#ffffff", borderColor: "#ddd8cc" }}
                      className="focus-visible:ring-[#c9a86a]"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="reg-password" style={{ fontFamily: "Inter, sans-serif", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.1em", color: "#7a7166", display: "block" }}>
                      Password
                    </label>
                    <Input
                      id="reg-password"
                      data-testid="input-reg-password"
                      type="password"
                      required
                      style={{ height: "44px", backgroundColor: "#ffffff", borderColor: "#ddd8cc" }}
                      className="focus-visible:ring-[#c9a86a]"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                    />
                  </div>
                  <button
                    type="submit"
                    data-testid="button-register"
                    disabled={regLoading}
                    style={{
                      width: "100%", height: "44px",
                      backgroundColor: regLoading ? "#4a5568" : "#0f2036",
                      color: "#f5f1ea", fontFamily: "Inter, sans-serif", fontWeight: 500, fontSize: "14px",
                      borderRadius: "2px", border: "none", cursor: regLoading ? "not-allowed" : "pointer",
                      marginTop: "8px", transition: "background-color 0.15s",
                    }}
                  >
                    {regLoading ? "Creating Account..." : "Create Account"}
                  </button>
                </form>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
