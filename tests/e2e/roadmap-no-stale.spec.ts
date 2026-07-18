/**
 * Ensures the Learning Roadmap never leaks stale data across account switches
 * or across the locked → analyzed transition within the same browser context.
 *
 * Scenarios covered:
 *  1. Sign in as user A (seeded with keyword A) → view roadmap → sign out →
 *     sign in as brand-new user B (no analyses) → /learning-roadmap must show
 *     the locked "Resume analysis required" state and NEVER user A's keyword
 *     or user A's email.
 *  2. Same fresh user B then seeds their own analysis with keyword B → reload
 *     → roadmap must show keyword B only, and never keyword A or email A.
 *
 * Run: bunx playwright test tests/e2e/roadmap-no-stale.spec.ts
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

async function clearSession(page: Page) {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
}

test.describe("Learning Roadmap — no stale data across accounts or transitions", () => {
  test.skip(!canRun, "Supabase env vars not set");
  test.setTimeout(120_000);

  test("account switch A→B and locked→analyzed never shows previous user's data", async ({ browser }) => {
    const api = await request.newContext();
    const userA = await signUp(api);
    const userB = await signUp(api);

    const keyA = `alpha-stale-${Date.now().toString(36)}`;
    const keyB = `bravo-fresh-${Date.now().toString(36)}`;

    await seedAnalysis(api, userA.session.access_token, userA.session.user.id, keyA);

    const context = await browser.newContext({ viewport: { width: 1280, height: 1800 } });
    const page = await context.newPage();

    // --- Step 1: A views their roadmap (keyword A present).
    await injectSession(page, userA.session);
    await page.goto(`${BASE}/learning-roadmap`, { waitUntil: "networkidle" });
    await expect(page.getByText(keyA, { exact: false })).toBeVisible({ timeout: 20_000 });

    // --- Step 2: sign out, sign in as fresh B (no analyses) → locked state, no A leak.
    await clearSession(page);
    await injectSession(page, userB.session);
    await page.goto(`${BASE}/learning-roadmap`, { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: /resume analysis required/i })).toBeVisible({ timeout: 15_000 });
    let body = (await page.locator("body").innerText()).toLowerCase();
    expect(body).not.toContain(keyA.toLowerCase());
    expect(body).not.toContain(userA.email.toLowerCase());

    // --- Step 3: seed B's own analysis → locked flips to real content with B's keyword only.
    await seedAnalysis(api, userB.session.access_token, userB.session.user.id, keyB);
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: /resume analysis required/i })).toHaveCount(0);
    await expect(page.getByText(keyB, { exact: false })).toBeVisible({ timeout: 20_000 });
    body = (await page.locator("body").innerText()).toLowerCase();
    expect(body).not.toContain(keyA.toLowerCase());
    expect(body).not.toContain(userA.email.toLowerCase());

    await context.close();
  });
});
