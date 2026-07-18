export function Footer() {
  return (
    <footer className="bg-surface-dark text-surface-dark-foreground">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-6 py-10 md:flex-row md:items-start md:justify-between">
        <div className="max-w-md text-center md:text-left">
          <h3 className="text-base font-semibold text-surface-dark-foreground">CareerLift AI</h3>
          <p className="mt-2 text-sm leading-relaxed text-surface-dark-muted">
            Your AI-powered career companion — sharpen your resume, ace mock interviews,
            and land your dream role at top product companies.
          </p>
        </div>
        <div className="text-center md:text-right">
          <p className="text-sm font-medium text-surface-dark-foreground">
            Made with love by C R RENUKA
          </p>
          <p className="mt-1 text-sm text-surface-dark-muted">Final year BE CSE</p>
          <a
            href="mailto:crrenuka28@gmail.com"
            className="mt-1 inline-block text-sm text-surface-dark-muted transition-colors hover:text-primary"
          >
            crrenuka28@gmail.com
          </a>
        </div>
      </div>
    </footer>
  );
}
