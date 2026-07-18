import { FileText, ListChecks, Mic } from "lucide-react";
import { FadeInSection } from "./FadeInSection";

const features = [
  {
    icon: FileText,
    title: "Resume Analyzer",
    description:
      "Upload your resume and get instant, role-specific feedback on wording, structure, and impact — powered by AI trained on hiring signals.",
  },
  {
    icon: ListChecks,
    title: "Application Tracker",
    description:
      "Keep every job, stage, and follow-up in one clean board. Never lose a lead or miss a reply again.",
  },
  {
    icon: Mic,
    title: "Mock Interview Coach",
    description:
      "Practice real interview questions with an AI coach that scores your answers and shows exactly what to improve.",
  },
];

export function Features() {
  return (
    <section id="features" className="bg-background py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <FadeInSection className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">Features</p>
          <h2 className="mt-3 text-4xl font-bold md:text-5xl">Everything you need to land the offer</h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Three focused tools that replace the scattered spreadsheets, notes, and guesswork of a modern job hunt.
          </p>
        </FadeInSection>

        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {features.map((f, i) => (
            <FadeInSection key={f.title} delay={i * 120}>
              <article className="group h-full rounded-xl border border-border bg-card p-8 shadow-soft transition-all hover:-translate-y-1 hover:shadow-elevated">
                <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/20">
                  <f.icon className="h-6 w-6" />
                </div>
                <h3 className="font-display text-xl font-semibold text-card-foreground">{f.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{f.description}</p>
              </article>
            </FadeInSection>
          ))}
        </div>
      </div>
    </section>
  );
}
