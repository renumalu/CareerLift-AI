import { createFileRoute, Link } from "@tanstack/react-router";

const URL = "https://careerliftaiproj.lovable.app/guides/ats-optimization";
const TITLE = "The Ultimate Guide to ATS Resume Optimization (2026)";
const DESCRIPTION =
  "Learn how Applicant Tracking Systems (ATS) really parse resumes, the formatting pitfalls that get you filtered, and a step-by-step checklist to boost your ATS resume score.";

export const Route = createFileRoute("/guides/ats-optimization")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:url", content: URL },
      { property: "og:type", content: "article" },
    ],
    links: [{ rel: "canonical", href: URL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Article",
          headline: TITLE,
          description: DESCRIPTION,
          url: URL,
          author: { "@type": "Organization", name: "CareerLift AI" },
          publisher: { "@type": "Organization", name: "CareerLift AI" },
        }),
      },
    ],
  }),
  component: AtsGuide,
});

function AtsGuide() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-foreground">
      <article className="prose prose-neutral dark:prose-invert max-w-none">
        <p className="text-sm text-muted-foreground">
          <Link to="/" className="underline">← Back to CareerLift AI</Link>
        </p>
        <h1 className="font-display text-4xl font-semibold tracking-tight">
          The Ultimate Guide to ATS Resume Optimization
        </h1>
        <p className="mt-3 text-lg text-muted-foreground">
          Most resumes never reach a human recruiter. They're filtered by an Applicant
          Tracking System (ATS) first. This guide explains exactly how ATS software
          parses your resume, what breaks it, and how to build a resume that scores
          high on any ATS resume checker.
        </p>

        <h2 className="mt-10 font-display text-2xl font-semibold">What is an ATS?</h2>
        <p>
          An Applicant Tracking System is the software companies use to receive,
          parse, store, and rank job applications. When you upload a resume to a
          job portal at Google, Meta, PayPal, Amazon, or nearly any Fortune 500
          company, the ATS is the first reader — not a recruiter. It extracts your
          contact info, work history, skills, and education into structured fields,
          then matches them against the job description.
        </p>

        <h2 className="mt-10 font-display text-2xl font-semibold">How ATS software parses your resume</h2>
        <ul>
          <li><strong>Text extraction:</strong> The ATS reads the underlying text layer of your PDF or DOCX. Scanned images and text baked into graphics are invisible.</li>
          <li><strong>Section detection:</strong> Standard section headings (<em>Experience</em>, <em>Education</em>, <em>Skills</em>) tell the parser what each block is.</li>
          <li><strong>Keyword matching:</strong> The system scores how many of the job description's must-have keywords appear in your resume.</li>
          <li><strong>Ranking:</strong> Recruiters sort candidates by that score before opening a single resume.</li>
        </ul>

        <h2 className="mt-10 font-display text-2xl font-semibold">Common ATS-unfriendly formatting pitfalls</h2>
        <ul>
          <li>Tables and multi-column layouts (parsers read left-to-right, top-to-bottom and merge columns into gibberish).</li>
          <li>Text placed inside headers, footers, or text boxes.</li>
          <li>Icons, images, or logos used to convey information (skill bars, rating stars).</li>
          <li>Non-standard fonts or embedded images of text.</li>
          <li>Complex section headings like "Where I've Made an Impact" instead of "Experience".</li>
          <li>Resumes exported as image-only PDFs (common with Canva templates).</li>
          <li>Contact info split across a sidebar the parser can't reach.</li>
        </ul>

        <h2 className="mt-10 font-display text-2xl font-semibold">The high-scoring ATS resume checklist</h2>
        <ol>
          <li>Use a single-column layout with clear headings: <em>Summary</em>, <em>Experience</em>, <em>Skills</em>, <em>Education</em>, <em>Projects</em>.</li>
          <li>Export as a text-based PDF or DOCX — never a scanned image.</li>
          <li>Mirror the exact keywords from the job description (both the spelled-out and acronym forms: "Amazon Web Services (AWS)").</li>
          <li>Quantify every bullet: numbers, percentages, dollars, or time saved.</li>
          <li>Start each bullet with a strong action verb.</li>
          <li>Include a dedicated <em>Skills</em> section for hard-skill keyword density.</li>
          <li>Keep formatting native — bold and bullet points only, no icons or tables.</li>
          <li>Save the file as <code>FirstName_LastName_Role.pdf</code>.</li>
          <li>Run your resume through a resume score / ATS resume checker before every submission.</li>
        </ol>

        <h2 className="mt-10 font-display text-2xl font-semibold">Get your ATS resume score in seconds</h2>
        <p>
          CareerLift AI's <Link to="/resume-analyzer" className="underline">Resume Analyzer</Link>{" "}
          runs every check above automatically. Upload your resume, paste any job
          description, and get an ATS score, a match score, missing keywords, and a
          fixes checklist — all in under a minute.
        </p>
        <p className="mt-6">
          <Link
            to="/auth"
            className="inline-flex items-center rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Try the Resume Analyzer free →
          </Link>
        </p>
      </article>
    </main>
  );
}
