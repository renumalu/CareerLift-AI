import { Link } from "@tanstack/react-router";
import { Moon, Sun } from "lucide-react";

type NavbarProps = {
  theme: "light" | "dark";
  onToggleTheme: () => void;
};

export function Navbar({ theme, onToggleTheme }: NavbarProps) {
  const isDark = theme === "dark";

  return (
    <header className="sticky top-0 z-50 border-b border-surface-dark-border bg-surface-dark/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <a href="#top" className="flex items-center gap-2 font-display text-lg font-semibold text-surface-dark-foreground">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_12px_var(--color-primary)]" />
          CareerLift <span className="text-primary">AI</span>
        </a>
        <nav className="hidden items-center gap-8 text-sm text-surface-dark-muted md:flex">
          <a href="#features" className="transition-colors hover:text-surface-dark-foreground">
            Features
          </a>
          <a href="#how-it-works" className="transition-colors hover:text-surface-dark-foreground">
            How it Works
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleTheme}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-surface-dark-border text-surface-dark-foreground transition-colors hover:bg-white/5"
            aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
            title={isDark ? "Light theme" : "Dark theme"}
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <Link
            to="/auth"
            className="rounded-xl border border-surface-dark-border bg-transparent px-4 py-2 text-sm font-medium text-surface-dark-foreground transition-colors hover:bg-white/5"
          >
            Sign In
          </Link>
        </div>
      </div>
    </header>
  );
}
