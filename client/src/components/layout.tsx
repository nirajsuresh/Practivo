import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { BrandWordmark } from "@/components/brand-wordmark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

/** Warm cream chrome for top & bottom bars (reference ~#F5E9CC). */
const CHROME_CREAM = "bg-[#F5E9CC]";
const CHROME_BORDER = "border-[#E5D4B0]";

function NavBtn({ href, label, active, testId }: { href: string; label: string; active: boolean; testId?: string }) {
  return (
    <Link href={href}>
      <Button
        variant="ghost"
        data-testid={testId}
        className={cn(
          "text-xs sm:text-sm font-semibold px-2 sm:px-3 h-9",
          active ? "bg-[#1C1C1A]/10 text-[#1C1C1A]" : "text-[#1C1C1A]/85 hover:bg-[#1C1C1A]/[0.06]",
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

  const handleLogout = () => {
    localStorage.removeItem("isLoggedIn");
    localStorage.removeItem("userId");
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
    <nav className={cn(
      "w-full py-3 px-4 md:px-8 xl:px-10 flex justify-between items-center z-50 transition-all duration-300",
      isLanding
        ? "absolute top-0 left-0 bg-transparent text-white"
        : cn("sticky top-0 border-b text-[#1C1C1A] backdrop-blur-sm", CHROME_CREAM, CHROME_BORDER)
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
            <NavBtn href="/" label="Library" active={location === "/"} />
            <NavBtn href="/profile" label="Profile" active={location === "/profile"} testId="link-profile" />
          </div>
        )}

        {isLoggedIn && !isLanding && (
          <form onSubmit={handleSearch} className="hidden md:flex relative max-w-sm w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#1C1C1A]/45" />
            <Input 
              placeholder="Search musicians or pieces..." 
              className="pl-10 bg-white/85 border border-[#E5D4B0] text-[#1C1C1A] placeholder:text-[#1C1C1A]/45 focus-visible:ring-1 focus-visible:ring-[#C8B388]/40"
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
              "text-xs sm:text-sm font-semibold px-2 sm:px-3 h-9",
              isLanding
                ? "text-white hover:text-white hover:bg-white/10"
                : "text-[#1C1C1A]/85 hover:bg-[#1C1C1A]/[0.06]",
            )}
            data-testid="button-logout"
          >
            Log out
          </Button>
        ) : (
          <>
            <Link href="/auth">
              <Button variant="ghost" className={cn(
                "text-base font-semibold",
                isLanding ? "text-white hover:text-white hover:bg-white/10" : "text-[#1C1C1A]/85 hover:bg-[#1C1C1A]/[0.06]",
              )}>
                Log In
              </Button>
            </Link>
            <Link href="/auth?tab=register">
              <Button className={cn(
                "rounded-full px-6 font-semibold transition-all shadow-none",
                isLanding 
                  ? "bg-white text-black hover:bg-white/90" 
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
              )}>
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
    <footer className={cn("border-t text-[#1C1C1A] py-16 px-4 md:px-8", CHROME_CREAM, CHROME_BORDER)}>
      <div className="max-w-[1700px] mx-auto grid grid-cols-1 md:grid-cols-4 gap-12">
        <div className="col-span-1 md:col-span-2">
          <div className="mb-4">
            <BrandWordmark size="lg" className="self-start" />
          </div>
          <p className="text-[#1C1C1A]/65 max-w-sm leading-relaxed">
            The definitive platform for serious classical musicians to track repertoire, 
            showcase their journey, and connect with peers.
          </p>
        </div>
        
        <div>
          <h3 className="font-sans font-semibold mb-4 tracking-wide text-sm uppercase text-[#1C1C1A]/55">Company</h3>
          <ul className="space-y-3">
            <li><Link href="#" className="text-[#1C1C1A]/80 hover:text-primary transition-colors">About Us</Link></li>
            <li><Link href="#" className="text-[#1C1C1A]/80 hover:text-primary transition-colors">Careers</Link></li>
            <li><Link href="#" className="text-[#1C1C1A]/80 hover:text-primary transition-colors">Contact</Link></li>
          </ul>
        </div>
      </div>
      <div className={cn("max-w-[1700px] mx-auto mt-16 pt-8 border-t text-center md:text-left text-sm text-[#1C1C1A]/50", CHROME_BORDER)}>
        © 2024 Réperto. All rights reserved.
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
