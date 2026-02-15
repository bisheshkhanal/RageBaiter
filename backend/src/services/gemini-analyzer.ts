import type { TweetAnalysis } from "./tweet-analysis-cache.js";

type EnvShape = {
  process?: {
    env?: Record<string, string | undefined>;
  };
};

type RetryableHttpError = {
  kind: "http";
  status: number;
  retryAfterMs: number | null;
};

type RetryableTimeoutError = {
  kind: "timeout";
};

type RetryableNetworkError = {
  kind: "network";
};

type RetryableError = RetryableHttpError | RetryableTimeoutError | RetryableNetworkError;

type GeminiStructuredResponse = {
  tweet_vector: {
    social: number;
    economic: number;
    populist: number;
  };
  fallacies: string[];
  topic: string;
  confidence: number;
  counter_argument: string;
  logic_failure: string;
  claim: string;
  mechanism: string;
  data_check: string;
  socratic_challenge: string;
};

type GeminiApiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
};

type GeminiAnalyzerLogger = {
  info: (message: string) => void;
  warn: (message: string) => void;
};

type GeminiAnalyzerOptions = {
  apiKey?: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  requestTimeoutMs?: number;
  maxInputChars?: number;
  rateLimiter?: { acquire: () => Promise<void> };
  logger?: GeminiAnalyzerLogger;
};

const GEMINI_MODEL = "gemini-2.5-flash";
const DEFAULT_MAX_INPUT_CHARS = 2_000;
const DEFAULT_TIMEOUT_MS = 25_000;
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 200;

const FEW_SHOT_EXAMPLES = [
  {
    input:
      "If I told you that a young man stabbed another young man to death for telling him that he was in the wrong seat, and then I told you that one young man in this altercation was white and the other black, and then I asked you to guess the race of the assailant, every single person would know the answer immediately. Young black males are violent to a wildly, outrageously disproportionate degree. That's just a fact. We all know it. And it's time that we speak honestly about it, or nothing will ever change.",
    output: {
      tweet_vector: { social: -0.8, economic: 0.1, populist: 0.7 },
      fallacies: ["Spurious Correlation", "Ecological Fallacy", "Appeal to Common Knowledge"],
      topic: "Race and Violence",
      confidence: 0.92,
      counter_argument:
        "This statement presents a statistical disparity as a racial trait, deliberately ignoring the stronger predictive variable: socioeconomic status. When researchers control for poverty, education, and neighborhood stability, the racial gap in violence rates shrinks or disappears entirely. Violence correlates most strongly with economic disadvantage, not race.",
      logic_failure: "Confounding Variable",
      claim: "Young black males are violent to a wildly, outrageously disproportionate degree.",
      mechanism:
        "This statement uses Spurious Correlation. It presents a statistical disparity as a racial trait, deliberately ignoring the stronger predictive variable: Socioeconomic Status.",
      data_check:
        "When researchers control for poverty, education, and neighborhood stability, the racial gap in violence rates shrinks or disappears entirely. Violence correlates most strongly with economic disadvantage, not race.",
      socratic_challenge:
        "If poverty and proximity to crime are the strongest predictors of violence regardless of race, why does this post focus exclusively on the racial identity of the subject? Is the goal to solve violence, or to assign blame?",
    },
  },
  {
    input: "Either we slash taxes immediately or small businesses will die tomorrow.",
    output: {
      tweet_vector: { social: 0.1, economic: 0.7, populist: 0.1 },
      fallacies: ["False Dilemma"],
      topic: "Tax Policy",
      confidence: 0.81,
      counter_argument:
        "Small business survival depends on many factors beyond tax rates. Countries with higher tax rates like Denmark and Germany maintain thriving small business sectors through reinvestment in infrastructure and education.",
      logic_failure: "False Dilemma",
      claim: "Either we slash taxes immediately or small businesses will die tomorrow.",
      mechanism:
        "This statement uses a False Dilemma. It presents only two extreme options (immediate tax cuts vs. total business failure), ignoring the spectrum of policy tools and timelines available.",
      data_check:
        "Small business survival depends on access to credit, consumer demand, supply chain stability, and regulatory clarity - not just tax rates. The SBA reports that most small business failures are caused by cash flow issues unrelated to taxation.",
      socratic_challenge:
        "If tax cuts alone determined small business survival, why do countries with higher tax rates maintain thriving small business sectors? What other factors might matter more?",
    },
  },
] as const;

class SlidingWindowRateLimiter {
  private readonly timestamps: number[] = [];

  public constructor(
    private readonly maxRequestsPerSecond: number,
    private readonly now: () => number,
    private readonly sleep: (ms: number) => Promise<void>
  ) {}

  public async acquire(): Promise<void> {
    while (true) {
      const now = this.now();
      this.prune(now);

      if (this.timestamps.length < this.maxRequestsPerSecond) {
        this.timestamps.push(now);
        return;
      }

      const oldest = this.timestamps[0];
      if (oldest === undefined) {
        continue;
      }

      const waitMs = Math.max(1, oldest + 1000 - now);
      await this.sleep(waitMs);
    }
  }

  private prune(now: number): void {
    while (this.timestamps.length > 0) {
      const oldest = this.timestamps[0];
      if (oldest === undefined) {
        return;
      }

      if (now - oldest < 1000) {
        return;
      }

      this.timestamps.shift();
    }
  }
}

const readEnv = (key: string): string | undefined => {
  return (globalThis as EnvShape).process?.env?.[key];
};

const sleep = async (ms: number): Promise<void> => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
};

const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};

const truncateDeterministically = (value: string, maxChars: number): string => {
  if (value.length <= maxChars) {
    return value;
  }

  return value.slice(0, maxChars);
};

const buildPrompt = (tweetText: string): string => {
  const examples = FEW_SHOT_EXAMPLES.map((example, index) => {
    return [
      `Example ${index + 1} input:`,
      example.input,
      `Example ${index + 1} output JSON:`,
      JSON.stringify(example.output),
    ].join("\n");
  }).join("\n\n");

  return [
    "You are a political tweet analyzer that detects logical fallacies and manipulative framing.",
    "Return only JSON with this exact shape and keys:",
    '{"tweet_vector":{"social":0,"economic":0,"populist":0},"fallacies":[""],"topic":"","confidence":0,"counter_argument":"","logic_failure":"","claim":"","mechanism":"","data_check":"","socratic_challenge":""}',
    "Rules:",
    "- tweet_vector fields are numbers in [-1, 1]",
    "- confidence is a number in [0, 1]",
    "- fallacies is an array of short strings naming specific logical fallacies",
    "- topic is a concise string",
    "- logic_failure: a short label for the primary logical failure (e.g. 'Confounding Variable', 'False Dilemma', 'Hasty Generalization')",
    "- claim: extract the core factual claim being made in the tweet, quoted or paraphrased directly",
    "- mechanism: 2-3 sentences explaining HOW the logical manipulation works. Name the specific fallacy technique and explain what variable or context is being ignored or distorted.",
    "- data_check: 2-3 sentences presenting concrete counter-evidence, research findings, or data that challenges the claim. Be specific with references to studies, statistics, or historical examples.",
    "- socratic_challenge: a pointed question (1-2 sentences) that exposes the logical gap in the argument. Frame it to make the reader think critically about the post's real intent.",
    "- counter_argument: 2-3 sentence rebuttal addressing the specific claims with evidence",
    "- no markdown, no prose, no code fences",
    "- best effort for non-English text",
    examples,
    "Analyze this tweet text:",
    tweetText,
  ].join("\n\n");
};

const extractJson = (raw: string): string | null => {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const withoutFences = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = withoutFences.indexOf("{");
  const end = withoutFences.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  return withoutFences.slice(start, end + 1);
};

const isObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const toStrictStructured = (value: unknown): GeminiStructuredResponse | null => {
  if (!isObject(value)) {
    return null;
  }

  const vector = value.tweet_vector;
  const fallacies = value.fallacies;
  const topic = value.topic;
  const confidence = value.confidence;

  if (!isObject(vector)) {
    return null;
  }

  if (typeof vector.social !== "number") {
    return null;
  }
  if (typeof vector.economic !== "number") {
    return null;
  }
  if (typeof vector.populist !== "number") {
    return null;
  }

  if (!Array.isArray(fallacies) || fallacies.some((item) => typeof item !== "string")) {
    return null;
  }

  if (typeof topic !== "string") {
    return null;
  }

  if (typeof confidence !== "number") {
    return null;
  }

  const counterArgument = typeof value.counter_argument === "string" ? value.counter_argument : "";
  const logicFailure = typeof value.logic_failure === "string" ? value.logic_failure : "";
  const claim = typeof value.claim === "string" ? value.claim : "";
  const mechanism = typeof value.mechanism === "string" ? value.mechanism : "";
  const dataCheck = typeof value.data_check === "string" ? value.data_check : "";
  const socraticChallenge =
    typeof value.socratic_challenge === "string" ? value.socratic_challenge : "";

  return {
    tweet_vector: {
      social: vector.social,
      economic: vector.economic,
      populist: vector.populist,
    },
    fallacies,
    topic,
    confidence,
    counter_argument: counterArgument,
    logic_failure: logicFailure,
    claim,
    mechanism,
    data_check: dataCheck,
    socratic_challenge: socraticChallenge,
  };
};

const toRetryableError = (error: unknown): RetryableError | null => {
  if (!isObject(error)) {
    return null;
  }

  const kind = error.kind;
  if (kind === "timeout") {
    return { kind: "timeout" };
  }
  if (kind === "network") {
    return { kind: "network" };
  }
  if (kind === "http" && typeof error.status === "number") {
    const retryAfterMs =
      typeof error.retryAfterMs === "number" && Number.isFinite(error.retryAfterMs)
        ? error.retryAfterMs
        : null;

    return {
      kind: "http",
      status: error.status,
      retryAfterMs,
    };
  }

  return null;
};

const parseRetryAfterMs = (headerValue: string | null): number | null => {
  if (!headerValue) {
    return null;
  }

  const seconds = Number(headerValue);
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.floor(seconds * 1000);
  }

  return null;
};

const calculateBackoff = (attempt: number, retryableError: RetryableError): number => {
  if (retryableError.kind === "http" && retryableError.retryAfterMs !== null) {
    return retryableError.retryAfterMs;
  }

  return BASE_BACKOFF_MS * 2 ** (attempt - 1);
};

const shouldRetry = (retryableError: RetryableError): boolean => {
  if (retryableError.kind === "timeout") {
    return true;
  }
  if (retryableError.kind === "network") {
    return true;
  }
  if (retryableError.kind === "http") {
    return retryableError.status === 429 || retryableError.status >= 500;
  }

  return false;
};

const sharedRateLimiter = new SlidingWindowRateLimiter(10, () => Date.now(), sleep);

const requestGemini = async (
  fetchImpl: typeof fetch,
  apiKey: string,
  prompt: string,
  timeoutMs: number,
  logger: GeminiAnalyzerLogger,
  now: () => number
): Promise<GeminiStructuredResponse | null> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  const startedAt = now();

  try {
    const response = await fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0,
            topP: 0,
            topK: 1,
            responseMimeType: "application/json",
          },
        }),
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      throw {
        kind: "http",
        status: response.status,
        retryAfterMs: parseRetryAfterMs(response.headers.get("retry-after")),
      } satisfies RetryableHttpError;
    }

    const responseBody = (await response.json().catch(() => null)) as GeminiApiResponse | null;
    const responseText =
      responseBody?.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? "")
        .join("")
        .trim() ?? "";
    const extractedJson = extractJson(responseText);

    if (!extractedJson) {
      return null;
    }

    const parsed = JSON.parse(extractedJson) as unknown;
    const structured = toStrictStructured(parsed);

    const durationMs = now() - startedAt;
    const tokenUsage = responseBody?.usageMetadata?.totalTokenCount ?? 0;
    logger.info(
      `[gemini-analyzer] request_ms=${durationMs} tokens_total=${tokenUsage} prompt_tokens=${responseBody?.usageMetadata?.promptTokenCount ?? 0} completion_tokens=${responseBody?.usageMetadata?.candidatesTokenCount ?? 0}`
    );

    return structured;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw { kind: "timeout" } satisfies RetryableTimeoutError;
    }

    const retryableError = toRetryableError(error);
    if (retryableError) {
      throw retryableError;
    }

    throw { kind: "network" } satisfies RetryableNetworkError;
  } finally {
    clearTimeout(timeout);
  }
};

export const createGeminiTweetAnalyzer = (options: GeminiAnalyzerOptions = {}) => {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => Date.now());
  const sleepImpl = options.sleep ?? sleep;
  const logger = options.logger ?? console;
  const maxInputChars = options.maxInputChars ?? DEFAULT_MAX_INPUT_CHARS;
  const timeoutMs = options.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  const rateLimiter = options.rateLimiter ?? sharedRateLimiter;

  return async (
    _tweetId: string,
    tweetText: string
  ): Promise<Omit<TweetAnalysis, "analyzedAt" | "expiresAt"> | null> => {
    const apiKey = (options.apiKey ?? readEnv("GEMINI_API_KEY") ?? "").trim();

    const trimmedText = tweetText.trim();
    if (trimmedText.length === 0) {
      return null;
    }

    if (apiKey.length === 0) {
      logger.warn("[gemini-analyzer] GEMINI_API_KEY missing, skipping analyzer");
      return null;
    }

    const truncated = truncateDeterministically(trimmedText, maxInputChars);
    const prompt = buildPrompt(truncated);

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        await rateLimiter.acquire();
        const structured = await requestGemini(fetchImpl, apiKey, prompt, timeoutMs, logger, now);

        if (!structured) {
          return null;
        }

        return {
          tweetText,
          tweetVector: {
            social: clamp(structured.tweet_vector.social, -1, 1),
            economic: clamp(structured.tweet_vector.economic, -1, 1),
            populist: clamp(structured.tweet_vector.populist, -1, 1),
          },
          fallacies: structured.fallacies,
          topic: structured.topic,
          confidence: clamp(structured.confidence, 0, 1),
          counterArgument: structured.counter_argument,
          logicFailure: structured.logic_failure,
          claim: structured.claim,
          mechanism: structured.mechanism,
          dataCheck: structured.data_check,
          socraticChallenge: structured.socratic_challenge,
        };
      } catch (error) {
        const retryableError = toRetryableError(error);
        const hasNextAttempt = attempt < MAX_ATTEMPTS;

        if (!retryableError || !shouldRetry(retryableError) || !hasNextAttempt) {
          logger.warn("[gemini-analyzer] failed after retries, returning null fallback");
          return null;
        }

        const backoffMs = calculateBackoff(attempt, retryableError);
        logger.warn(`[gemini-analyzer] retry attempt=${attempt + 1} backoff_ms=${backoffMs}`);
        await sleepImpl(backoffMs);
      }
    }

    return null;
  };
};

export const geminiAnalyzeTweet = createGeminiTweetAnalyzer();

export const geminiAnalyzerInternals = {
  truncateDeterministically,
};
