import { Link, useLocation } from "wouter";

export function Nav() {
  const [location] = useLocation();

  return (
    <nav className="r-nav">
      <Link href="/" className="r-nav-brand">Réperto</Link>
      <div className="r-nav-links">
        <Link href="/" data-active={location === "/"}>Today</Link>
        <Link href="/plan" data-active={location === "/plan"}>Plan</Link>
        <Link href="/session" data-active={location === "/session"}>Session</Link>
        <Link
          href="/add"
          data-active={location === "/add"}
          style={{ marginLeft: "0.5rem", paddingLeft: "1rem", borderLeft: "1px solid var(--divider)" }}
        >
          + Add
        </Link>
      </div>
    </nav>
  );
}
