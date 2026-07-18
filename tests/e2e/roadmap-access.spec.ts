/**
 * Roadmap access + network isolation E2E.
 *
 * Covers three requirements:
 *  1. A user with NO resume analyses always sees the locked empty-state on
 *     /learning-roadmap, even via direct navigation — no roadmap items,
 *     no keyword pills, no other user's data.
 *  2. The network requests /learning-roadmap makes to the server function
 *     only ever return the signed-in user's rows — user B's unique keyword
 *     never appears in any response body.
 *  3. After switching from user A to user B in the same browser, the page
 *     never renders user A's email address anywhere.
 *
 * Run: bunx playwright test tests/e2e/roadmap-access.spec.ts
 * Requires: VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, VITE_SUPABASE_PROJECT_ID.
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

test.describe("Learning Roadmap access + isolation", () => {
  test.skip(!canRun, "Supabase env vars not set");
  test.setTimeout(120_000);

  test("user without resume analyses gets locked empty state on direct navigation", async ({ browser }) => {
    const api = await request.newContext();
    const { session } = await signUp(api);

    const context = await browser.newContext({ viewport: { width: 1280, height: 1800 } });
    const page = await context.newPage();
    await injectSession(page, session);

    // Direct navigation — no analyses seeded.
    await page.goto(`${BASE}/learning-roadmap`, { waitUntil: "networkidle" });
    expect(page.url()).toContain("/learning-roadmap");

    await expect(page.getByRole("heading", { name: /resume analysis required/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("link", { name: /go to resume analyzer/i })).toBeVisible();

    // No roadmap content should have rendered.
    const body = (await page.locator("body").innerText()).toLowerCase();
    expect(body).not.toContain("detected skill gaps");
    expect(body).not.toContain("priority");
    await context.close();
  });

  test("roadmap network responses only contain the signed-in user's rows", async ({ browser }) => {
    const api = await request.newContext();
    const userA = await signUp(api);
    const userB = await signUp(api);

    const keyA = `alpha-${Date.now().toString(36)}`;
    const keyB = `bravo-${Date.now().toString(36)}`;
    await seedAnalysis(api, userA.session.access_token, userA.session.user.id, keyA);
    await seedAnalysis(api, userB.session.access_token, userB.session.user.id, keyB);

    const context = await browser.newContext({ viewport: { width: 1280, height: 1800 } });
    const page = await context.newPage();

    const bodies: string[] = [];
    page.on("response", async (res) => {
      const url = res.url();
      if (!url.includes("/_serverFn/") && !url.includes("resume_analyses") && !url.includes("roadmap")) return;
      try {
        const text = await res.text();
        if (text) bodies.push(text);
      } catch {
        /* ignore non-text bodies */
      }
    });

    await injectSession(page, userA.session);
    await page.goto(`${BASE}/learning-roadmap`, { waitUntil: "networkidle" });
    await expect(page.getByText(keyA, { exact: false })).toBeVisible({ timeout: 20_000 });

    // Every captured body must be free of user B's keyword and email.
    for (const b of bodies) {
      const lower = b.toLowerCase();
      expect(lower, `response leaked user B keyword: ${b.slice(0, 200)}`).not.toContain(keyB.toLowerCase());
      expect(lower, `response leaked user B email: ${b.slice(0, 200)}`).not.toContain(userB.email.toLowerCase());
    }
    await context.close();
  });

  test("switching accounts never renders the previous user's email on the roadmap", async ({ browser }) => {
    const api = await request.newContext();
    const userA = await signUp(api);
    const userB = await signUp(api);
    const keyA = `carol-${Date.now().toString(36)}`;
    const keyB = `delta-${Date.now().toString(36)}`;
    await seedAnalysis(api, userA.session.access_token, userA.session.user.id, keyA);
    await seedAnalysis(api, userB.session.access_token, userB.session.user.id, keyB);

    const context = await browser.newContext({ viewport: { width: 1280, height: 1800 } });
    const page = await context.newPage();

    // Sign in as A, load roadmap.
    await injectSession(page, userA.session);
    await page.goto(`${BASE}/learning-roadmap`, { waitUntil: "networkidle" });
    await expect(page.getByText(keyA, { exact: false })).toBeVisible({ timeout: 20_000 });

    // Switch to B in the same browser context (simulates sign-out + sign-in).
    await injectSession(page, userB.session);
    await page.goto(`${BASE}/learning-roadmap`, { waitUntil: "networkidle" });
    await expect(page.getByText(keyB, { exact: false })).toBeVisible({ timeout: 20_000 });

    const html = (await page.content()).toLowerCase();
    expect(html, "user A email leaked after account switch").not.toContain(userA.email.toLowerCase());
    expect(html, "user A keyword leaked after account switch").not.toContain(keyA.toLowerCase());
    await context.close();
  });
});
