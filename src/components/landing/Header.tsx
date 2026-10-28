import { Button } from "@/components/ui/button";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

const links = [
  { to: "/deals", label: "Deals" },
  { to: "/funds", label: "Funds" },
  { to: "/tip", label: "Send a tip" },
  { to: "/people-moves", label: "People" },
  { to: "/archive", label: "Archive" },
  { to: "/about", label: "About" },
];

export const Header = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const goSubscribe = () => {
    if (pathname === "/") {
      document.getElementById("subscribe")?.scrollIntoView({ behavior: "smooth" });
    } else {
      navigate("/#subscribe");
    }
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background border-b-2 border-foreground">
      <div className="container max-w-6xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="font-extrabold text-lg tracking-tight">THE GP PULSE</Link>
          <nav className="hidden md:flex items-center gap-6">
            {links.map((l) => (
              <Link key={l.to} to={l.to} className={cn("text-sm transition-colors hover:text-muted-foreground", pathname.startsWith(l.to) && "font-bold underline underline-offset-4")}>
                {l.label}
              </Link>
            ))}
            <Button size="sm" className="shadow-xs hover:shadow-sm transition-shadow" onClick={goSubscribe}>Subscribe</Button>
          </nav>
          <div className="flex md:hidden gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/archive")}>Archive</Button>
            <Button size="sm" className="shadow-xs" onClick={goSubscribe}>Subscribe</Button>
          </div>
        </div>
      </div>
    </header>
  );
};
