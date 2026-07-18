import { z } from "zod";

export const TOTAL_QUESTIONS = 5;

const QuestionType = z.enum(["behavioral", "technical"]);

const CategoriesSchema = z.object({
  communication: z.number(),
  technical_depth: z.number(),
  clarity: z.number(),
  structure: z.number(),
});

const FeedbackSchema = z.object({
  score: z.number(),
  strengths: z.array(z.string()),
  missing: z.array(z.string()),
  categories: CategoriesSchema.optional(),
  star_analysis: z.object({
    applicable: z.boolean(),
    situation: z.boolean(),
    task: z.boolean(),
    action: z.boolean(),
    result: z.boolean(),
    notes: z.string().optional(),
  }),
});

export type InterviewFeedback = z.infer<typeof FeedbackSchema>;

function extractJsonFromResponse(response: string): unknown | null {
  const cleaned = response
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();
  const start = cleaned.search(/[\{\[]/);
  if (start === -1) return null;

  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let i = start; i < cleaned.length; i += 1) {
    const char = cleaned[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{" || char === "[") {
      stack.push(char === "{" ? "}" : "]");
      continue;
    }

    if (char === "}" || char === "]") {
      if (stack.pop() !== char) return null;
      if (stack.length === 0) {
        const candidate = cleaned.slice(start, i + 1);
        try {
          return JSON.parse(candidate);
        } catch {
          try {
            return JSON.parse(
              candidate
                .replace(/,\s*}/g, "}")
                .replace(/,\s*]/g, "]")
                .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ""),
            );
          } catch {
            return null;
          }
        }
      }
    }
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function callAI(system: string, user: string) {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "career-lift-ai",
    },
    body: JSON.stringify({
      model: "openai/gpt-5.5",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 429) throw new Error("Rate limit reached. Please try again in a moment.");
    if (res.status === 402) throw new Error("AI credits exhausted. Add credits in your workspace settings.");
    throw new Error(`AI request failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = String(data?.choices?.[0]?.message?.content ?? "");
  return extractJsonFromResponse(content);
}

const STOP_WORDS = new Set([
  "a","an","the","and","or","but","if","then","of","for","to","in","on","at","by","with","from","as","is","are","was","were","be","been","being","do","does","did","have","has","had","can","could","would","should","will","shall","may","might","must","i","you","your","we","our","us","they","them","their","he","she","it","its","this","that","these","those","how","what","when","where","why","which","who","whom","about","into","over","under","than","so","such","up","down","out","off","just","also","not","no","yes","some","any","one","two","tell","me","give","describe","walk","through","explain","share","talk","provide","example","time","situation","story","specific","concrete","real","recent",
]);

export function normalizeQuestion(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOP_WORDS.has(w))
    .sort()
    .join(" ");
}

function tokenSet(input: string): Set<string> {
  return new Set(normalizeQuestion(input).split(" ").filter(Boolean));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

const SIMILARITY_THRESHOLD = 0.7;

function isNearDuplicate(question: string, priorNorms: Set<string>, priorTokens: Set<string>[]): boolean {
  const norm = normalizeQuestion(question);
  if (!norm) return false;
  if (priorNorms.has(norm)) return true;
  const tokens = tokenSet(question);
  for (const p of priorTokens) {
    if (jaccard(tokens, p) >= SIMILARITY_THRESHOLD) return true;
  }
  return false;
}

function fallbackQuestion(
  role: string,
  difficulty: string,
  index: number,
  priorNorms: Set<string> = new Set(),
  priorTokens: Set<string>[] = [],
) {
  const type = index % 2 === 0 ? "behavioral" : "technical";
  const behavioral = [
    `Tell me about a specific project where you delivered impact as a ${role}. What was the situation, what did you personally do, and what measurable result did it produce?`,
    `Describe a time you disagreed with a teammate or stakeholder on a ${role} decision. How did you resolve it?`,
    `Walk me through a time you had to learn a new tool or skill quickly to succeed in a ${role} responsibility.`,
    `Tell me about a mistake you made as a ${role} and what you changed in your process afterwards.`,
    `Describe how you prioritized competing deadlines in a recent ${role} project.`,
  ];
  const technical = [
    `For a ${difficulty}-level ${role} task, walk me through how you would break down requirements, choose an approach, and validate the result.`,
    `What are the key trade-offs you weigh when making technical decisions as a ${role}? Give a concrete example.`,
    `Describe the tools, frameworks, or methodologies you rely on most as a ${role}, and why you chose them over alternatives.`,
    `How do you measure success and quality in your work as a ${role}? What metrics or signals do you track?`,
  ];
  const bank = type === "behavioral" ? behavioral : technical;
  const start = index + Math.floor(Math.random() * bank.length);
  for (let i = 0; i < bank.length; i += 1) {
    const candidate = bank[(start + i) % bank.length];
    if (!isNearDuplicate(candidate, priorNorms, priorTokens)) {
      return { question: candidate, type };
    }
  }
  return { question: bank[start % bank.length], type };
}

export async function generateQuestion(
  role: string,
  difficulty: string,
  prior: { question: string; type: string }[],
  index: number,
  strict: boolean = false,
) {
  const desiredType = index % 2 === 0 ? "behavioral" : "technical";
  const priorNorms = new Set(prior.map((p) => normalizeQuestion(p.question)).filter(Boolean));
  const priorTokens = prior.map((p) => tokenSet(p.question));

  const maxAttempts = strict ? 6 : 3;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const seed = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${attempt}`;
    const system = `You are a senior hiring manager at a top product-based company (Google, Meta, Amazon, Apple, Microsoft, Netflix, PayPal, Stripe, Uber, Airbnb, LinkedIn, Atlassian, Salesforce, etc.) conducting a REAL job interview for the specific role: "${role}".
Generate ONE authentic interview question at ${difficulty} difficulty that has actually been asked (or is highly representative of what is asked) for a "${role}" position at these companies.

Hard rules:
- The question MUST be specific to the "${role}" role — reference the concrete skills, tools, frameworks, domain concepts, systems, or responsibilities that role actually involves day-to-day.
- Draw from real question banks used at top product companies (Meta, Google, PayPal, Amazon, Apple, Microsoft, Netflix, Stripe, Uber, Airbnb, etc.).
- Different roles MUST get different questions. Tailor terminology, tools, and scenarios to "${role}" only.
- Difficulty MUST visibly change the depth: easy = fundamentals; medium = applied scenarios/trade-offs; hard = senior/staff-level system design, deep trade-offs, ambiguous open-ended problems.
- ${strict ? "STRICT MODE: You MUST NOT repeat, paraphrase, restate, or overlap in topic/keywords with ANY prior question below. Choose a completely fresh subject area." : "DO NOT repeat, paraphrase, or reuse the same topic/keywords as any prior question listed below. Pick a DIFFERENT subject area."}
- Return ONLY JSON: {"question": "...", "type": "behavioral"|"technical"}. Prefer type=${desiredType}.
- Variation seed: ${seed}.`;
    const user = `Role: ${role}\nDifficulty: ${difficulty}\nQuestion number: ${index + 1} of ${TOTAL_QUESTIONS}\nDesired type: ${desiredType}\n\nPrior questions already asked (do NOT repeat, do NOT paraphrase, pick a different topic/subject area):\n${prior.map((p, i) => `${i + 1}. [${p.type}] ${p.question}`).join("\n") || "(none yet — this is the first question)"}\n\nWrite the next real, role-specific, ${difficulty}-difficulty interview question now on a fresh topic.`;

    try {
      const parsed = await callAI(system, user);
      if (!isRecord(parsed)) continue;

      const question = String(parsed.question ?? "").trim().slice(0, 800);
      if (!question) continue;

      if (isNearDuplicate(question, priorNorms, priorTokens)) {
        priorNorms.add(normalizeQuestion(question));
        priorTokens.push(tokenSet(question));
        continue;
      }

      const parsedType = QuestionType.safeParse(parsed.type);
      const type = parsedType.success ? parsedType.data : desiredType;
      return { question, type };
    } catch (error) {
      if (error instanceof Error && (error.message.includes("Rate limit") || error.message.includes("credits"))) {
        throw error;
      }
      break;
    }
  }

  if (strict) {
    // In strict mode, refuse to fall back to a possibly-duplicate canned question.
    throw new Error(
      "Strict no-repeat: could not generate a fresh question for this role and difficulty. Try disabling strict mode or resetting history.",
    );
  }
  return fallbackQuestion(role, difficulty, index, priorNorms, priorTokens);
}

function fallbackFeedback(questionType: string): InterviewFeedback {
  const isBehavioral = questionType === "behavioral";
  return {
    score: 6,
    strengths: ["You gave a direct answer and stayed focused on the question."],
    missing: ["Add a clearer example, specific actions you took, and measurable results where possible."],
    categories: { communication: 6, technical_depth: 6, clarity: 6, structure: 6 },
    star_analysis: {
      applicable: isBehavioral,
      situation: false,
      task: false,
      action: true,
      result: false,
      notes: isBehavioral
        ? "Try structuring the answer with Situation, Task, Action, and Result for a stronger response."
        : "For technical answers, explain your reasoning, trade-offs, and validation steps.",
    },
  };
}

export async function generateFeedback(input: {
  role: string;
  difficulty: string;
  questionType: string;
  question: string;
  answer: string;
}) {
  const system = `You are a strict but supportive interview coach. Score the candidate's answer 0-10 for the given question and role, and rate four sub-categories independently.
Return ONLY JSON matching:
{
  "score": <integer 0-10>,
  "strengths": [<string>, ...],
  "missing": [<string>, ...],
  "categories": {
    "communication": <integer 0-10>,
    "technical_depth": <integer 0-10>,
    "clarity": <integer 0-10>,
    "structure": <integer 0-10>
  },
  "star_analysis": {
    "applicable": <boolean>,
    "situation": <boolean>,
    "task": <boolean>,
    "action": <boolean>,
    "result": <boolean>,
    "notes": "<optional short note about missing STAR parts>"
  }
}
For technical questions set star_analysis.applicable=false and all STAR booleans=false.`;
  const user = `Role: ${input.role}\nDifficulty: ${input.difficulty}\nQuestion type: ${input.questionType}\nQuestion: ${input.question}\n\nCandidate answer:\n"""\n${input.answer}\n"""`;

  try {
    const raw = await callAI(system, user);
    const result = FeedbackSchema.safeParse(raw);
    return result.success ? result.data : fallbackFeedback(input.questionType);
  } catch (error) {
    if (error instanceof Error && (error.message.includes("Rate limit") || error.message.includes("credits"))) {
      throw error;
    }
    return fallbackFeedback(input.questionType);
  }
}

export async function generateTips(input: {
  role: string;
  difficulty: string;
  transcript: string;
}) {
  try {
    const tipsRaw = await callAI(
      `You are an interview coach. Given a full mock interview transcript, produce 2-3 overall improvement tips as JSON: {"tips": [<string>, ...]} — each tip 1-2 sentences, specific, actionable.`,
      `Role: ${input.role}. Difficulty: ${input.difficulty}.\nTranscript:\n${input.transcript}`,
    );

    if (isRecord(tipsRaw) && Array.isArray(tipsRaw.tips)) {
      return tipsRaw.tips.map((tip) => String(tip)).filter(Boolean).slice(0, 3);
    }
  } catch (error) {
    if (error instanceof Error && (error.message.includes("Rate limit") || error.message.includes("credits"))) {
      throw error;
    }
  }

  return [
    "Use a tighter STAR structure so each answer clearly shows the situation, your action, and the result.",
    "Add one or two measurable details to make your impact easier for interviewers to remember.",
  ];
}