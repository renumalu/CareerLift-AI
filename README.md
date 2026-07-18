# CareerLift AI

> **AI-powered career preparation platform for final-year CSE students and job seekers targeting product-based companies.**

CareerLift AI is a full-stack web application that helps you prepare for technical and HR interviews, optimize your resume for ATS systems, track job applications, and build a personalized learning roadmap — all in one place.

---

## What the App Does

CareerLift AI acts as your personal career coach. It combines resume intelligence, mock interviews, and job-application tracking so you can:

- Understand how well your resume matches a specific job description.
- Practice role-specific mock interviews with AI-generated questions inspired by real hiring patterns at Meta, Google, PayPal, Microsoft, and other product-based companies.
- Track every job application with real-time status updates.
- Get a custom AI learning roadmap based on gaps found in your resume.
- Monitor your progress through dashboards, analytics charts, and performance breakdowns.

Whether you are preparing for campus placements or applying off-campus, CareerLift AI keeps your preparation organized and data-driven.

---

## Features

### Resume Analyzer
- Upload resumes in PDF or DOCX format.
- Extract text and preview it inline before analysis.
- Paste any job description and compare it against your resume.
- Get an ATS score and a match score shown as animated circular rings.
- See missing keywords as pill tags and matched keywords highlighted in the resume preview.
- Receive ATS-specific fixes checklist and actionable content suggestions.
- Re-analyze the same uploaded resume against a different job description without re-uploading.
- All analyses are saved to your account history for future reference.

### AI Mock Interview
- Select a role (Software Engineer, Data Scientist, Product Manager, etc.) and difficulty level (Easy, Medium, Hard).
- AI generates fresh, company-style questions tailored to the role and difficulty.
- Strict no-repeat toggle prevents previously asked questions from appearing again for the same role and difficulty.
- Get category-wise feedback: Communication, Technical Depth, Clarity, and Structure.
- Export your full transcript and feedback summary as a branded PDF.
- Start a fresh attempt for the same role and difficulty at any time.
- Reset interview history per role or across all roles.
- Exit the interview while saving progress.

### Application Tracker
- Add, edit, and delete job applications.
- Track company, role, status, applied date, location, salary, link, and notes.
- Visualize application status distribution and trends on the dashboard.
- Real-time updates across the app.
- Export your tracker as a CSV file.

### AI Learning Roadmap
- Aggregates missing keywords and skill gaps from your resume analyses.
- Generates a prioritized study plan with topic explanations.
- Provides curated resource links to documentation, articles, practice platforms, and courses.
- Locked until you upload and analyze at least one resume, so the roadmap is always personalized.

### Dashboard & Analytics
- Central dashboard with quick action cards.
- Real-time counts for applications, resume analyses, and interview sessions.
- Resume score and interview performance trend charts over time.
- App health score and overall progress indicators.

### Authentication & Theming
- Secure sign-up and sign-in with email and password.
- Protected authenticated routes — only signed-in users can access dashboard, resume analyzer, mock interview, application tracker, and learning roadmap.
- Light and dark theme toggle on the landing page.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | TanStack Start v1 (React 19 + Vite 7) |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Backend | Cloud backend with Auth, Database, Storage, and Realtime |
| Database | PostgreSQL (managed) |
| Server Logic | TanStack `createServerFn` |
| AI | AI Gateway (Google Gemini models) |
| Charts | Recharts |
| PDF Export | jsPDF |
| Resume Parsing | pdfjs-dist (PDF), mammoth (DOCX) |
| Deployment | Cloud deployment platform |

---

## Developer Setup

This section explains how to clone, configure, and run CareerLift AI on your local machine from the terminal.

### What You Need Before Starting

Make sure the following tools are installed and working on your system.

#### 1. Node.js

This project requires **Node.js 20 or higher**.

Check your current version:

```bash
node --version
```

If the version is lower than `v20.0.0`, install a newer version from [https://nodejs.org](https://nodejs.org) or use a version manager.

If you use `nvm`, switch to the project's recommended version:

```bash
nvm use
```

The recommended version is stored in `.nvmrc`.

#### 2. Bun Package Manager

This project uses **Bun** instead of npm or yarn.

Check if Bun is installed:

```bash
bun --version
```

If it is not installed, run the official install command:

```bash
curl -fsSL https://bun.sh/install | bash
```

After installing, restart your terminal or run:

```bash
source ~/.bashrc
```

If you are on macOS or Linux and the command is still not found, add Bun to your path:

```bash
export PATH="$HOME/.bun/bin:$PATH"
```

To verify:

```bash
bun --version
```

#### 3. Git

Check that Git is installed:

```bash
git --version
```

#### 4. A Cloud Backend Project

CareerLift AI needs a backend with:

- Authentication (email/password)
- PostgreSQL database with the required tables
- Storage bucket for resume uploads
- Realtime enabled on relevant tables

Make sure your backend project is created and migrations are applied before running the app locally.

---

### Step-by-Step Local Setup

#### Step 1: Clone the Repository

Open your terminal and run:

```bash
git clone <repository-url>
cd careerlift-ai
```

Replace `<repository-url>` with the actual URL of your project repository.

#### Step 2: Switch to the Correct Node Version (Optional)

If you use `nvm`:

```bash
nvm use
```

#### Step 3: Install Dependencies

Run the following command from the project root:

```bash
bun install
```

This reads `package.json` and installs every dependency into `node_modules/`. The first install may take a few minutes.

If you see permission errors, make sure Bun is installed correctly and added to your path.

#### Step 4: Create the Environment File

Create a file named `.env` in the project root. You can use any text editor or the terminal:

```bash
touch .env
```

Paste the following into `.env` and replace the placeholder values with your actual backend credentials:

```env
# Public client-safe variables (used by the browser bundle)
VITE_SUPABASE_PROJECT_ID=your_project_id
VITE_SUPABASE_URL=https://your_project_id.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_anon_publishable_key

# Server-only secrets (used only in server functions / SSR)
SUPABASE_PROJECT_ID=your_project_id
SUPABASE_URL=https://your_project_id.supabase.co
SUPABASE_PUBLISHABLE_KEY=your_anon_publishable_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# AI Gateway API key (server-only)
# The exact variable name depends on your hosting provider's AI integration.
AI_GATEWAY_API_KEY=your_ai_gateway_key

# Optional: Google OAuth credentials if you enable social login
GOOGLE_OAUTH_CLIENT_ID=your_google_client_id
GOOGLE_OAUTH_CLIENT_SECRET=your_google_client_secret
```

> **Security note:** Never commit `.env` or any secret values to Git. The public `VITE_` variables are safe for the browser; server-only keys must stay on the hosting environment.

#### Step 5: Start the Development Server

Run the dev server with:

```bash
bun run dev
```

You will see output similar to:

```text
VITE v8.x.x  ready in xxx ms

➜  Local:   http://localhost:8080/
```

Open your browser and go to:

```
http://localhost:8080
```

The development server supports hot module replacement, so most code changes will appear instantly without restarting the server.

#### Step 6: Verify the App is Running

Once the page loads, you should see the CareerLift AI landing page. Try the following checks:

- Toggle light/dark mode using the theme button.
- Navigate to the authentication page.
- Sign up with a new email and password.
- After signing in, visit `/dashboard`, `/resume-analyzer`, `/mock-interview`, `/application-tracker`, and `/learning-roadmap`.

If any of these pages show errors, check the terminal output and browser console for details.

---

### Useful Terminal Commands

| Command | What It Does |
|---------|--------------|
| `bun --version` | Check Bun version |
| `node --version` | Check Node.js version |
| `bun install` | Install project dependencies |
| `bun run dev` | Start the local development server at `http://localhost:8080` |
| `bun run build` | Create an optimized production build in `dist/` |
| `bun run preview` | Preview the production build locally |
| `bun run lint` | Run ESLint and report code issues |
| `bun run format` | Format all code files with Prettier |
| `bun run test:e2e` | Run all Playwright end-to-end tests |
| `bun run test:e2e:roadmap` | Run roadmap-specific E2E tests |

---

### Production Build Workflow

Use this workflow when you want to run the app in production mode on your local machine.

#### Step 1: Make sure dependencies are installed

```bash
bun install
```

#### Step 2: Verify environment variables

Ensure your `.env` file exists in the project root and contains all required variables.

```bash
cat .env
```

At minimum you need:

```env
VITE_SUPABASE_URL=https://your_project_id.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_anon_publishable_key
SUPABASE_URL=https://your_project_id.supabase.co
SUPABASE_PUBLISHABLE_KEY=your_anon_publishable_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
AI_GATEWAY_API_KEY=your_ai_gateway_key
```

#### Step 3: Run the production build

```bash
bun run build
```

This command performs the following:

1. **Type-checks** the TypeScript source code.
2. **Bundles** the client-side JavaScript and CSS with Vite.
3. **Builds** the server-side entry for SSR.
4. **Prerenders** routes where configured.
5. **Outputs** the final files into the `dist/` directory.

Expected output structure inside `dist/`:

```text
dist/
  assets/          # Hashed static assets (JS, CSS, images)
  client/          # Client-side bundle
  server/          # Server-side bundle for SSR
  index.html       # Entry HTML file
```

#### Step 4: Preview the production build locally

```bash
bun run preview
```

This starts a local server from the `dist/` folder. By default it runs at:

```
http://localhost:8080
```

Open this URL in your browser. The preview server behaves as close to production as possible, including SSR and environment variable handling.

#### Step 5: Stop the preview server

Press `Ctrl + C` in the terminal to stop the server.

---

### Common Setup Issues

| Issue | Solution |
|-------|----------|
| `bun: command not found` | Reinstall Bun and add `export PATH="$HOME/.bun/bin:$PATH"` to your shell profile. |
| `Port 8080 is already in use` | Kill the other process or change the port in your environment. |
| `Failed to resolve import` | Run `bun install` again to make sure all packages are installed. |
| Database or auth errors | Double-check your `.env` values, especially `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. |
| `.env` accidentally committed | Add `.env` to `.gitignore` and remove it from Git history. |

---

## Deployment

The project is configured for cloud deployment with the included `netlify.toml` file.

### Deploy to Cloud Hosting

1. Push the repository to a Git provider such as GitHub.
2. In your hosting dashboard, create a new site and import the existing project.
3. Select the repository you just pushed.
4. Set the build settings:
   - **Build command:** `bun run build`
   - **Publish directory:** `dist`
5. Add all environment variables from your `.env` file in the hosting dashboard under **Site settings → Environment variables**.
6. Trigger a deploy.

The hosting platform will detect `netlify.toml` and run the build automatically. Once the build succeeds, your app will be live at the provided URL.

### Custom Domain and HTTPS

After publishing:

1. Go to your project settings and open the **Domains** section.
2. Click **Connect Domain** and enter your domain, for example `careerliftai.com` and `www.careerliftai.com`.
3. Add the DNS records shown by the platform at your domain registrar. Typically this includes:
   - **A record** for `@` pointing to the provided IP
   - **A record** for `www` pointing to the provided IP
   - **TXT record** for the verification subdomain shown by the platform
4. Wait for DNS propagation (a few minutes up to 72 hours).
5. HTTPS / SSL will be provisioned automatically once the domain is verified.

---

## Project Structure and Architecture

The project follows TanStack Start v1 file-based routing. Routes map directly to files inside `src/routes/`, and shared UI lives under `src/components/`.

```text
src/
  components/        # Reusable UI components (dashboard, landing, etc.)
  integrations/      # Auth and database clients
  lib/               # Server functions, utilities, AI logic, and helpers
  routes/            # TanStack file-based routes
  styles.css         # Tailwind v4 theme tokens and global styles
  start.ts           # App start configuration
supabase/            # Database migrations and configuration
netlify.toml         # Deployment settings
.nvmrc               # Recommended Node.js version
```

### Landing Page Architecture

The landing page is a lightweight, single-route page served at `/`.

```text
src/routes/index.tsx       # Route definition, SEO head, theme state, page layout
src/components/landing/
  Navbar.tsx               # Sticky header with logo, nav links, theme toggle, sign-in button
  Hero.tsx                 # Top hero section with headline, description, and CTA
  Features.tsx             # Feature cards for Resume Analyzer, Mock Interview, Tracker, Roadmap
  HowItWorks.tsx           # Step-by-step explanation of the platform
  Testimonials.tsx         # Social proof / user quotes section
  Footer.tsx               # Footer with branding and author details
```

#### How the landing page works

1. `src/routes/index.tsx` declares the `/` route and renders the `Landing` component.
2. The `Landing` component manages light/dark theme state and stores the user's choice in `localStorage` under the key `careerlift-theme`.
3. The theme is applied to the `<html>` element using the `dark` Tailwind class.
4. The page is composed of six landing components arranged in this order:
   - `Navbar` — sticky at the top
   - `Hero` — main value proposition
   - `Features` — highlights key features
   - `HowItWorks` — explains the user flow
   - `Testimonials` — builds trust
   - `Footer` — closing details and links
5. The `Navbar` uses in-page anchor links (`#features`, `#how-it-works`) for smooth navigation.
6. The "Sign In" button routes to `/auth` using TanStack Router's `Link` component.
7. SEO meta tags, Open Graph tags, canonical URL, and JSON-LD structured data are set in the route's `head()` so search engines and social shares render correctly.

---

## Testing

The project includes Playwright end-to-end tests for critical flows.

To run all tests:

```bash
bun run test:e2e
```

To run roadmap-related tests only:

```bash
bun run test:e2e:roadmap
```

Tests cover:
- Authentication and user isolation
- Learning roadmap access and transitions
- Resume analyzer workflows
- Dashboard real-time updates
- Security headers and JWT validation

---

## Author

**C R Renuka**  
Final year BE CSE  
Email: [crrenuka28@gmail.com](mailto:crrenuka28@gmail.com)

---

## License

This project is built for academic and personal use.
