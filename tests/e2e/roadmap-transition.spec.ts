/**
 * Logged-out access + post-analysis transition E2E for /learning-roadmap.
 *
 * 1. A logged-out visitor navigating to /learning-roadmap must be redirected
 *    to /auth and must NOT trigger any roadmap data server-function request.
 * 2. A signed-in user who seeds a resume analysis must see the locked empty
 *    state disappear and the real roadmap content appear on refresh.
 *
 * Run: bunx playwright test tests/e2e/roadmap-transition.spec.ts
 */
import { test, expect, request, type APIRequestContext, type Page } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:8080";
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_ANON = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
const PROJECT_REF = process.env.VITE_SUPABASE_PROJECT_ID ?? "";
const canRun = Boolean(SUPABASE_URL && SUPABASE_ANON && PROJECT_REF);

type Session = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at: number;
  token_type: "bearer";
  user: { id: string; email: string };
};

async function signUp(api: APIRequestContext): Promise<{ session: Session; email: string }> {
  const email = `e2e+${Date.now()}-${Math.random().toString(36).slice(2, 8)}@careerlift.test`;
  const password = `Pw!${Math.random().toString(36).slice(2)}Aa1`;
  const res = await api.post(`${SUPABASE_URL}/auth/v1/signup`, {
    headers: { apikey: SUPABASE_ANON, "Content-Type": "application/json" },
    data: { email, password },
  });
  if (!res.ok()) throw new Error(`signup failed: ${res.status()} ${await res.text()}`);
  let body = await res.json();
  if (!body.access_token) {
    const login = await api.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      headers: { apikey: SUPABASE_ANON, "Content-Type": "application/json" },
      data: { email, password },
    });
    if (!login.ok()) throw new Error(`login failed: ${login.status()} ${await login.text()}`);
    body = await login.json();
  }
  return { session: body as Session, email };
}

async function seedAnalysis(api: APIRequestContext, token: string, userId: string, keyword: string) {
  const res = await api.post(`${SUPABASE_URL}/rest/v1/resume_analyses`, {
    headers: {
      apikey: SUPABASE_ANON,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    data: {
      user_id: userId,
      resume_text: "seed",
      extracted_resume_text: "seed",
      job_description: "seed",
      overall_score: 70,
      ats_score: 60,
      category_scores: { skills_match: 70, experience_relevance: 70, ats_compatibility: 60, formatting_clarity: 80 },
      missing_keywords: [keyword],
      ats_fixes: [],
      suggestions: [],
    },
  });
  if (!res.ok()) throw new Error(`seed failed: ${res.status()} ${await res.text()}`);
}

async function injectSession(page: Page, session: Session) {
  const storageKey = `sb-${PROJECT_REF}-auth-token`;
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.evaluate(
    ([k, v]) => {
      window.localStorage.clear();
      window.localStorage.setItem(k, v);
    },
    [storageKey, JSON.stringify(session)] as [string, string],
  );
}

test.describe("Learning Roadmap auth + transition", () => {
  test.skip(!canRun, "Supabase env vars not set");
  test.setTimeout(120_000);

  test("logged-out user is redirected from /learning-roadmap and no roadmap requests fire", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 1800 } });
    const page = await context.newPage();

    // Ensure no session exists.
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => window.localStorage.clear());

    const roadmapRequests: string[] = [];
    page.on("request", (req) => {
      const url = req.url();
      if (url.includes("getLearningRoadmap") || url.includes("roadmap.functions") || url.includes("/resume_analyses")) {
        roadmapRequests.push(url);
      }
    });

    await page.goto(`${BASE}/learning-roadmap`, { waitUntil: "networkidle" });

    // Route gate should redirect to /auth.
    await expect(page).toHaveURL(/\/auth(\?|$)/, { timeout: 15_000 });

    // No roadmap data requests should have been issued.
    expect(roadmapRequests, `unexpected roadmap requests: ${roadmapRequests.join(", ")}`).toHaveLength(0);

    await context.close();
  });

  test("creating a resume analysis flips locked empty state to real roadmap content", async ({ browser }) => {
    const api = await request.newContext();
    const { session } = await signUp(api);

    const context = await browser.newContext({ viewport: { width: 1280, height: 1800 } });
    const page = await context.newPage();
    await injectSession(page, session);

    // Step 1: no analyses yet — locked empty state.
    await page.goto(`${BASE}/learning-roadmap`, { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: /resume analysis required/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /go to resume analyzer/i })).toBeVisible();

    // Step 2: seed a resume analysis as this user.
    const keyword = `kubernetes-${Date.now().toString(36)}`;
    await seedAnalysis(api, session.access_token, session.user.id, keyword);

    // Step 3: reload — locked state must be gone; keyword pill + roadmap items visible.
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: /resume analysis required/i })).toHaveCount(0);
    await expect(page.getByText(/detected skill gaps/i)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(keyword, { exact: false })).toBeVisible({ timeout: 20_000 });

    await context.close();
  });
});
