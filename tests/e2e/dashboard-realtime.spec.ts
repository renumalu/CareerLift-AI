/**
 * Verifies dashboard charts/lists update in real time (via Supabase realtime
 * subscriptions) when rows are inserted into job_applications, resume_analyses,
 * and interview_sessions.
 *
 * Strategy:
 *  1. Sign up a throwaway user via Supabase Auth REST -> get access token + user id.
 *  2. Seed the browser with that session in localStorage under the sb-<ref>-auth-token key
 *     so the app treats us as signed in.
 *  3. Open /dashboard and wait for the initial "Recent activity" render.
 *  4. Insert rows via PostgREST using the user's bearer token (RLS-scoped).
 *  5. Assert the new rows appear on the dashboard without a manual reload.
 *
 * Run with: bunx playwright test tests/e2e/dashboard-realtime.spec.ts
 * Requires env: VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, VITE_SUPABASE_PROJECT_ID.
 */
import { test, expect, request, type APIRequestContext } from "@playwright/test";

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

async function signUp(api: APIRequestContext): Promise<Session> {
  const email = `e2e+${Date.now()}-${Math.random().toString(36).slice(2, 8)}@careerlift.test`;
  const password = `Pw!${Math.random().toString(36).slice(2)}Aa1`;
  const res = await api.post(`${SUPABASE_URL}/auth/v1/signup`, {
    headers: { apikey: SUPABASE_ANON, "Content-Type": "application/json" },
    data: { email, password },
  });
  if (!res.ok()) throw new Error(`signup failed: ${res.status()} ${await res.text()}`);
  const body = await res.json();
  if (!body.access_token) {
    // Fallback: sign in (in case auto-confirm produced no session token)
    const login = await api.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      headers: { apikey: SUPABASE_ANON, "Content-Type": "application/json" },
      data: { email, password },
    });
    if (!login.ok()) throw new Error(`login failed: ${login.status()} ${await login.text()}`);
    return (await login.json()) as Session;
  }
  return body as Session;
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
  const arr = await res.json();
  return Array.isArray(arr) ? arr[0] : arr;
}

test.describe("Dashboard realtime updates", () => {
  test.skip(!canRun, "Supabase env vars not set");
  test.setTimeout(60_000);

  test("charts and lists react to inserts across all three tables", async ({ browser }) => {
    const api = await request.newContext();
    const session = await signUp(api);
    const userId = session.user.id;
    const token = session.access_token;
    const storageKey = `sb-${PROJECT_REF}-auth-token`;

    const context = await browser.newContext({ viewport: { width: 1280, height: 1800 } });
    const page = await context.newPage();

    // Establish origin, then seed the Supabase session in localStorage.
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await page.evaluate(
      ([key, value]) => window.localStorage.setItem(key, value),
      [storageKey, JSON.stringify(session)] as [string, string],
    );

    await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
    // Sanity: we should not have been bounced to /auth.
    expect(page.url()).toContain("/dashboard");

    // Wait for the dashboard shell to render.
    await expect(page.getByRole("heading", { name: /dashboard/i }).first()).toBeVisible({
      timeout: 15_000,
    });

    // --- 1) job_applications insert ---------------------------------------
    const company = `Acme-${Date.now().toString(36)}`;
    await pgInsert(api, token, "job_applications", {
      user_id: userId,
      company,
      role: "SWE",
      status: "applied",
      applied_date: new Date().toISOString().slice(0, 10),
    });
    await expect(page.getByText(new RegExp(`Applied to ${company}`, "i"))).toBeVisible({
      timeout: 15_000,
    });

    // --- 2) resume_analyses insert ---------------------------------------
    await pgInsert(api, token, "resume_analyses", {
      user_id: userId,
      resume_text: "Realtime test resume body.",
      extracted_resume_text: "Realtime test resume body.",
      job_description: "Realtime test job description.",
      overall_score: 88,
      ats_score: 80,
      category_scores: {
        skills_match: 90,
        experience_relevance: 85,
        ats_compatibility: 80,
        formatting_clarity: 90,
      },
      missing_keywords: ["kubernetes"],
      ats_fixes: ["Use a single-column layout."],
      suggestions: ["Quantify results."],
    });
    await expect(page.getByText(/Analyzed a resume/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Score\s+88\s*\/\s*100/i)).toBeVisible({ timeout: 15_000 });

    // --- 3) interview_sessions insert -----------------------------------
    const role = `Backend-${Date.now().toString(36)}`;
    await pgInsert(api, token, "interview_sessions", {
      user_id: userId,
      role,
      difficulty: "medium",
      completed: true,
      summary: { average_score: 7.5, strengths: [], improvements: [] },
    });
    await expect(page.getByText(new RegExp(`Mock interview.*${role}`, "i"))).toBeVisible({
      timeout: 15_000,
    });

    await context.close();
  });
});
