import { ArrowRight, Sparkles } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { FadeInSection } from "./FadeInSection";

export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden bg-surface-dark text-surface-dark-foreground">
      {/* Ambient glows */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-40 top-10 h-[420px] w-[420px] rounded-full opacity-40 blur-3xl"
        style={{ background: "radial-gradient(circle, var(--color-primary) 0%, transparent 60%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-32 bottom-0 h-[360px] w-[360px] rounded-full opacity-25 blur-3xl"
        style={{ background: "radial-gradient(circle, var(--color-secondary) 0%, transparent 60%)" }}
      />
      {/* Subtle grid */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "linear-gradient(var(--color-surface-dark-foreground) 1px, transparent 1px), linear-gradient(90deg, var(--color-surface-dark-foreground) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage: "radial-gradient(ellipse at center, black 40%, transparent 75%)",
        }}
      />

      <div className="relative mx-auto max-w-6xl px-6 py-24 md:py-36">
        <FadeInSection className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-surface-dark-border bg-white/5 px-3 py-1 text-xs font-medium text-surface-dark-muted">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Your AI-powered career copilot
          </span>
          <h1 className="mt-6 font-display text-5xl font-bold leading-[1.05] md:text-6xl lg:text-7xl">
            Land your next job{" "}
            <span className="text-primary">faster</span> with AI.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-surface-dark-muted md:text-xl">
            CareerLift AI analyzes your resume, tracks every application, and coaches you through
            mock interviews — so you show up sharper and get offers sooner.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/auth"
              className="group inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-base font-semibold text-primary-foreground shadow-elevated transition-transform hover:scale-[1.02]"
            >
              Get Started Free
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a
              href="#how-it-works"
              className="inline-flex items-center justify-center rounded-xl border border-surface-dark-border px-6 py-3.5 text-base font-medium text-surface-dark-foreground transition-colors hover:bg-white/5"
            >
              See how it works
            </a>
          </div>
          <p className="mt-6 text-xs text-surface-dark-muted">
            Free forever plan · No credit card required
          </p>
        </FadeInSection>
      </div>
    </section>
  );
}
