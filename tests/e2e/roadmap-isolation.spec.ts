/**
 * Roadmap isolation between users.
 *
 * Signs up two throwaway users (A and B). Seeds each with a distinct
 * resume_analysis whose missing_keywords produce a unique roadmap keyword.
 * Then, in two separate browser contexts, loads /learning-roadmap as each
 * user and asserts:
 *   - user A sees A's keyword and NEVER sees B's keyword or B's email
 *   - user B sees B's keyword and NEVER sees A's keyword or A's email
 *
 * Run: bunx playwright test tests/e2e/roadmap-isolation.spec.ts
 * Requires: VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, VITE_SUPABASE_PROJECT_ID.
 */
import { test, expect, request, type APIRequestContext, type Browser } from "@playwright/test";

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

async function signUp(api: APIRequestContext): Promise<{ session: Session; email: string; password: string }> {
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
  return { session: body as Session, email, password };
}

async function pgInsert(api: APIRequestContext, token: string, table: string, row: unknown) {
  const res = await api.post(`${SUPABASE_URL}/rest/v1/${table}`, {
    headers: {
      apikey: SUPABASE_ANON,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    data: row,
  });
  if (!res.ok()) throw new Error(`insert ${table} failed: ${res.status()} ${await res.text()}`);
  return res.json();
}

async function openRoadmapAs(browser: Browser, session: Session) {
  const storageKey = `sb-${PROJECT_REF}-auth-token`;
  const context = await browser.newContext({ viewport: { width: 1280, height: 1800 } });
  const page = await context.newPage();
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.evaluate(
    ([k, v]) => window.localStorage.setItem(k, v),
    [storageKey, JSON.stringify(session)] as [string, string],
  );
  await page.goto(`${BASE}/learning-roadmap`, { waitUntil: "networkidle" });
  expect(page.url()).toContain("/learning-roadmap");
  return { context, page };
}

test.describe("Learning Roadmap user isolation", () => {
  test.skip(!canRun, "Supabase env vars not set");
  test.setTimeout(90_000);

  test("each user only sees their own roadmap keywords and never the other user's email", async ({ browser }) => {
    const api = await request.newContext();
    const userA = await signUp(api);
    const userB = await signUp(api);

    // Distinct, unlikely-to-collide missing keywords per user.
    const keyA = `zeta-alpha-${Date.now().toString(36)}`;
    const keyB = `omega-bravo-${Date.now().toString(36)}`;

    await pgInsert(api, userA.session.access_token, "resume_analyses", {
      user_id: userA.session.user.id,
      resume_text: "User A resume.",
      extracted_resume_text: "User A resume.",
      job_description: "User A JD.",
      overall_score: 70,
      ats_score: 60,
      category_scores: { skills_match: 70, experience_relevance: 70, ats_compatibility: 60, formatting_clarity: 80 },
      missing_keywords: [keyA],
      ats_fixes: [],
      suggestions: [],
    });

    await pgInsert(api, userB.session.access_token, "resume_analyses", {
      user_id: userB.session.user.id,
      resume_text: "User B resume.",
      extracted_resume_text: "User B resume.",
      job_description: "User B JD.",
      overall_score: 70,
      ats_score: 60,
      category_scores: { skills_match: 70, experience_relevance: 70, ats_compatibility: 60, formatting_clarity: 80 },
      missing_keywords: [keyB],
      ats_fixes: [],
      suggestions: [],
    });

    // ---- User A viewpoint --------------------------------------------------
    const aView = await openRoadmapAs(browser, userA.session);
    await expect(aView.page.getByRole("heading", { name: /learning roadmap/i })).toBeVisible({ timeout: 15_000 });
    await expect(aView.page.getByText(keyA, { exact: false })).toBeVisible({ timeout: 15_000 });
    const aBody = (await aView.page.locator("body").innerText()).toLowerCase();
    expect(aBody).not.toContain(keyB.toLowerCase());
    expect(aBody).not.toContain(userB.email.toLowerCase());
    await aView.context.close();

    // ---- User B viewpoint --------------------------------------------------
    const bView = await openRoadmapAs(browser, userB.session);
    await expect(bView.page.getByRole("heading", { name: /learning roadmap/i })).toBeVisible({ timeout: 15_000 });
    await expect(bView.page.getByText(keyB, { exact: false })).toBeVisible({ timeout: 15_000 });
    const bBody = (await bView.page.locator("body").innerText()).toLowerCase();
    expect(bBody).not.toContain(keyA.toLowerCase());
    expect(bBody).not.toContain(userA.email.toLowerCase());
    await bView.context.close();

    // ---- Cross-check via PostgREST: user A's token cannot read user B's rows.
    const crossRead = await api.get(
      `${SUPABASE_URL}/rest/v1/resume_analyses?user_id=eq.${userB.session.user.id}&select=id,user_id`,
      { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${userA.session.access_token}` } },
    );
    expect(crossRead.ok()).toBeTruthy();
    const rows = (await crossRead.json()) as unknown[];
    expect(rows.length).toBe(0);
  });
});
