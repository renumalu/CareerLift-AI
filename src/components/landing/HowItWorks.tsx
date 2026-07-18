import { FadeInSection } from "./FadeInSection";

const steps = [
  {
    n: "01",
    title: "Upload your resume",
    body: "Drop in your current resume and tell us the roles you're targeting.",
  },
  {
    n: "02",
    title: "Get an AI game plan",
    body: "We rewrite weak spots, surface missing keywords, and queue up practice questions.",
  },
  {
    n: "03",
    title: "Apply, practice, land",
    body: "Track applications in one board while rehearsing interviews with your AI coach.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="bg-muted/40 py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <FadeInSection className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">How it works</p>
          <h2 className="mt-3 text-4xl font-bold md:text-5xl">From resume to offer in 3 steps</h2>
        </FadeInSection>

        <div className="relative mt-16 grid gap-8 md:grid-cols-3">
          <div
            aria-hidden
            className="pointer-events-none absolute left-8 right-8 top-8 hidden h-px bg-gradient-to-r from-transparent via-border to-transparent md:block"
          />
          {steps.map((s, i) => (
            <FadeInSection key={s.n} delay={i * 150}>
              <div className="relative rounded-xl bg-card p-8 shadow-soft">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary font-display text-xl font-bold text-secondary-foreground shadow-soft">
                  {s.n}
                </div>
                <h3 className="mt-6 font-display text-xl font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
              </div>
            </FadeInSection>
          ))}
        </div>
      </div>
    </section>
  );
}
