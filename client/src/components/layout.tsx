import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BRAND } from "@/lib/palette";

export function Navbar() {
  const [location, setLocation] = useLocation();
  const isLanding = location === "/";
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    setIsLoggedIn(localStorage.getItem("isLoggedIn") === "true");
  }, [location]);

  const currentUserId = localStorage.getItem("userId") || "";

  const { data: pendingReceived = [] } = useQuery<any[]>({
    queryKey: ["/api/connections/received", currentUserId],
    queryFn: async () => {
      const res = await fetch("/api/connections/received", { headers: { "x-user-id": currentUserId } });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: isLoggedIn && !!currentUserId,
    refetchInterval: 30000,
  });

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
      "w-full py-5 px-4 md:px-8 xl:px-10 flex justify-between items-center z-50 transition-all duration-300",
      isLanding ? "absolute top-0 left-0 bg-transparent text-white" : "bg-[#fdedda] text-foreground backdrop-blur-md border-b border-border sticky top-0"
    )}>
      <div className="flex items-center gap-8 flex-1">
        <Link href="/">
          <div className="flex items-center cursor-pointer group">
            <img 
              src="/images/logo.png" 
              alt="Réperto Logo" 
              className="h-[4.5rem] w-auto transition-all group-hover:opacity-80"
            />
          </div>
        </Link>

        {isLoggedIn && !isLanding && (
          <form onSubmit={handleSearch} className="hidden md:flex relative max-w-sm w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Search musicians or pieces..." 
              className="pl-10 bg-muted/50 border-none focus-visible:ring-1 focus-visible:ring-accent"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </form>
        )}
      </div>

      <div className="flex items-center gap-6">
        {isLoggedIn ? (
          <>
            <Link href="/communities">
              <Button
                variant="ghost"
                className={cn(
                  "text-base font-semibold hover:bg-white/10",
                  isLanding ? "text-white hover:text-white" : "text-foreground hover:bg-black/5"
                )}
                data-testid="link-home"
              >
                Communities
              </Button>
            </Link>
            <Link href="/connections">
              <Button 
                variant="ghost" 
                className={cn(
                  "text-base font-semibold hover:bg-white/10 relative",
                  isLanding ? "text-white hover:text-white" : "text-foreground hover:bg-black/5"
                )}
                data-testid="link-connections"
              >
                Connections
                {pendingReceived.length > 0 && (
                  <span className="absolute -top-1 -right-1 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: BRAND.primary }} data-testid="badge-pending-count">
                    {pendingReceived.length}
                  </span>
                )}
              </Button>
            </Link>
            <Link href="/profile">
              <Button 
                variant="ghost" 
                className={cn(
                  "text-base font-semibold hover:bg-white/10",
                  isLanding ? "text-white hover:text-white" : "text-foreground hover:bg-black/5"
                )}
                data-testid="link-profile"
              >
                Profile
              </Button>
            </Link>
            <Button 
              variant="ghost" 
              onClick={handleLogout}
              className={cn(
                "text-base font-semibold hover:bg-white/10",
                isLanding ? "text-white hover:text-white" : "text-foreground hover:bg-black/5"
              )}
              data-testid="button-logout"
            >
              Log Out
            </Button>
          </>
        ) : (
          <>
            <Link href="/auth">
              <Button variant="ghost" className={cn(
                "text-base font-semibold hover:bg-white/10",
                isLanding ? "text-white hover:text-white" : "text-foreground hover:bg-black/5"
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
    <footer className="bg-primary text-primary-foreground py-16 px-4 md:px-8">
      <div className="max-w-[1700px] mx-auto grid grid-cols-1 md:grid-cols-4 gap-12">
        <div className="col-span-1 md:col-span-2">
          <h2 className="font-serif text-3xl font-bold mb-4">Réperto</h2>
          <p className="text-primary-foreground/70 max-w-sm leading-relaxed">
            The definitive platform for serious classical musicians to track repertoire, 
            showcase their journey, and connect with peers.
          </p>
        </div>
        
        <div>
          <h3 className="font-sans font-semibold mb-4 tracking-wide text-sm uppercase opacity-70">Company</h3>
          <ul className="space-y-3">
            <li><Link href="#" className="hover:text-accent transition-colors">About Us</Link></li>
            <li><Link href="#" className="hover:text-accent transition-colors">Careers</Link></li>
            <li><Link href="#" className="hover:text-accent transition-colors">Contact</Link></li>
          </ul>
        </div>
      </div>
      <div className="max-w-[1700px] mx-auto mt-16 pt-8 border-t border-white/10 text-center md:text-left text-sm text-primary-foreground/50">
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