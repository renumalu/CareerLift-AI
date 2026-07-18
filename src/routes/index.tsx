import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Navbar } from "@/components/landing/Navbar";
import { Hero } from "@/components/landing/Hero";
import { Features } from "@/components/landing/Features";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Testimonials } from "@/components/landing/Testimonials";
import { Footer } from "@/components/landing/Footer";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CareerLift AI — Land your next job faster with AI" },
      {
        name: "description",
        content:
          "AI resume analysis, ATS scoring, application tracking, and mock interview coaching in one platform. Get your next offer, faster.",
      },
      { property: "og:title", content: "CareerLift AI — Land your next job faster with AI" },
      {
        property: "og:description",
        content:
          "AI resume analysis, ATS scoring, application tracking, and mock interview coaching in one platform.",
      },
      { property: "og:url", content: "https://careerliftaiproj.lovable.app/" },
    ],
    links: [{ rel: "canonical", href: "https://careerliftaiproj.lovable.app/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "CareerLift AI",
          url: "https://careerliftaiproj.lovable.app/",
          description:
            "AI resume analysis, ATS scoring, application tracking, and mock interview coaching in one platform.",
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "CareerLift AI",
          url: "https://careerliftaiproj.lovable.app/",
        }),
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("careerlift-theme");
    const nextTheme = savedTheme === "dark" ? "dark" : "light";
    setTheme(nextTheme);
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
  }, []);

  function toggleTheme() {
    setTheme((current) => {
      const nextTheme = current === "dark" ? "light" : "dark";
      document.documentElement.classList.toggle("dark", nextTheme === "dark");
      window.localStorage.setItem("careerlift-theme", nextTheme);
      return nextTheme;
    });
  }

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors duration-300">
      <Navbar theme={theme} onToggleTheme={toggleTheme} />
      <main>
        <Hero />
        <Features />
        <HowItWorks />
        <Testimonials />
      </main>
      <Footer />
    </div>
  );
}
