import { FadeInSection } from "./FadeInSection";

const testimonials = [
  {
    quote:
      "The resume analyzer caught things three recruiter friends missed. I got two callbacks in the first week.",
    name: "Maya R.",
    role: "Product Designer",
    initials: "MR",
  },
  {
    quote:
      "Mock interviews felt uncomfortably real — which is exactly why my actual interviews finally didn't.",
    name: "Devon L.",
    role: "Backend Engineer",
    initials: "DL",
  },
  {
    quote:
      "I stopped losing track of 40+ applications. The tracker alone paid for itself the first day.",
    name: "Priya S.",
    role: "Marketing Manager",
    initials: "PS",
  },
];

export function Testimonials() {
  return (
    <section className="bg-background py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <FadeInSection className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">Loved by job seekers</p>
          <h2 className="mt-3 text-4xl font-bold md:text-5xl">Real people. Real offers.</h2>
        </FadeInSection>

        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {testimonials.map((t, i) => (
            <FadeInSection key={t.name} delay={i * 120}>
              <figure className="h-full rounded-xl border border-border bg-card p-8 shadow-soft">
                <blockquote className="text-base leading-relaxed text-card-foreground">
                  &ldquo;{t.quote}&rdquo;
                </blockquote>
                <figcaption className="mt-6 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 font-display text-sm font-semibold text-primary">
                    {t.initials}
                  </div>
                  <div>
                    <div className="text-sm font-semibold">{t.name}</div>
                    <div className="text-xs text-muted-foreground">{t.role}</div>
                  </div>
                </figcaption>
              </figure>
            </FadeInSection>
          ))}
        </div>
      </div>
    </section>
  );
}
