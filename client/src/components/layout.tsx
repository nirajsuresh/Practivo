import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { BrandWordmark } from "@/components/brand-wordmark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

function NavBtn({ href, label, active, testId }: { href: string; label: string; active: boolean; testId?: string }) {
  return (
    <Link href={href}>
      <Button
        variant="ghost"
        data-testid={testId}
        className={cn(
          "text-xs px-2 sm:px-3 h-9 font-normal tracking-[0.1em] uppercase",
          "font-sans",
          active
            ? "bg-[#0f2036]/10 text-[#0f2036]"
            : "text-[#0f2036]/70 hover:bg-[#0f2036]/[0.06] hover:text-[#0f2036]",
        )}
      >
        {label}
      </Button>
    </Link>
  );
}

export function Navbar() {
  const [location, setLocation] = useLocation();
  const [isLoggedIn, setIsLoggedIn] = useState(
    () => typeof window !== "undefined" && localStorage.getItem("isLoggedIn") === "true",
  );
  /** Marketing hero only when logged out on home; logged-in home uses the same bar as the rest of the app. */
  const isLanding = location === "/" && !isLoggedIn;
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    setIsLoggedIn(localStorage.getItem("isLoggedIn") === "true");
  }, [location]);

  const qc = useQueryClient();

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
    localStorage.removeItem("isLoggedIn");
    localStorage.removeItem("userId");
    localStorage.removeItem("username");
    localStorage.removeItem("firstName");
    localStorage.removeItem("isNewUser");
    setIsLoggedIn(false);
    qc.clear();
    setLocation("/");
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setLocation(`/search?q=${encodeURIComponent(searchQuery)}`);
    }
  };

  return (
    <nav
      className={cn(
        "w-full py-3 px-4 md:px-8 xl:px-10 flex justify-between items-center z-50 transition-all duration-300",
        isLanding
          ? "absolute top-0 left-0 bg-transparent text-white"
          : "sticky top-0 border-b border-[#ddd8cc] bg-[#f5f1ea] text-[#0f2036] backdrop-blur-sm",
      )}
    >
      <div className="flex items-center gap-8 flex-1">
        <Link href="/">
          <div className="flex items-center cursor-pointer group py-0.5">
            <BrandWordmark
              inverse={isLanding}
              className="transition-opacity group-hover:opacity-90"
              size="md"
            />
          </div>
        </Link>

        {isLoggedIn && !isLanding && (
          <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
            <NavBtn href="/home" label="Home" active={location === "/home"} testId="link-profile" />
          </div>
        )}

        {isLoggedIn && !isLanding && (
          <form onSubmit={handleSearch} className="hidden md:flex relative max-w-sm w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#0f2036]/40" />
            <Input
              placeholder="Search musicians or pieces..."
              className="pl-10 bg-[#f5f1ea] border border-[#ddd8cc] text-[#0f2036] placeholder:text-[#0f2036]/40 focus-visible:ring-1 focus-visible:ring-[#c9a86a]/60"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </form>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {isLoggedIn ? (
          <Button
            variant="ghost"
            onClick={handleLogout}
            className={cn(
              "text-xs px-2 sm:px-3 h-9 font-normal tracking-[0.1em] uppercase font-sans",
              isLanding
                ? "text-white hover:text-white hover:bg-white/10"
                : "text-[#0f2036]/70 hover:bg-[#0f2036]/[0.06] hover:text-[#0f2036]",
            )}
            data-testid="button-logout"
          >
            Log out
          </Button>
        ) : (
          <>
            <Link href="/auth">
              <Button
                variant="ghost"
                className={cn(
                  "text-xs font-normal tracking-[0.1em] uppercase font-sans",
                  isLanding
                    ? "text-white hover:text-white hover:bg-white/10"
                    : "text-[#0f2036]/70 hover:bg-[#0f2036]/[0.06] hover:text-[#0f2036]",
                )}
              >
                Log In
              </Button>
            </Link>
            <Link href="/auth?tab=register">
              <Button
                className={cn(
                  "rounded-sm px-5 font-sans text-xs tracking-[0.08em] uppercase font-medium transition-all shadow-none",
                  isLanding
                    ? "bg-white text-[#0f2036] hover:bg-white/90"
                    : "bg-[#0f2036] text-[#f5f1ea] hover:bg-[#0f2036]/90",
                )}
              >
                Join Now
              </Button>
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-[#ddd8cc] bg-[#f5f1ea] text-[#0f2036] py-16 px-4 md:px-8">
      <div className="max-w-[1700px] mx-auto grid grid-cols-1 md:grid-cols-4 gap-12">
        <div className="col-span-1 md:col-span-2">
          <div className="mb-4">
            <BrandWordmark size="lg" className="self-start" />
          </div>
          <p className="text-[#0f2036]/60 max-w-sm leading-relaxed">
            The definitive platform for serious classical musicians to track repertoire,
            showcase their journey, and connect with peers.
          </p>
        </div>

        <div>
          <h3
            className="font-sans font-medium mb-4 tracking-[0.12em] text-[11px] uppercase text-[#7a7166]"
          >
            Company
          </h3>
          <ul className="space-y-3">
            <li><Link href="#" className="text-[#0f2036]/75 hover:text-[#c9a86a] transition-colors text-sm">About Us</Link></li>
            <li><Link href="#" className="text-[#0f2036]/75 hover:text-[#c9a86a] transition-colors text-sm">Careers</Link></li>
            <li><Link href="#" className="text-[#0f2036]/75 hover:text-[#c9a86a] transition-colors text-sm">Contact</Link></li>
          </ul>
        </div>
      </div>
      <div className="max-w-[1700px] mx-auto mt-16 pt-8 border-t border-[#ddd8cc] text-center md:text-left text-sm text-[#0f2036]/45">
        © 2024 Practivo. All rights reserved.
      </div>
    </footer>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col font-sans">
      <Navbar />
      <main className="flex-1">
        {children}
      </main>
      <Footer />
    </div>
  );
}
