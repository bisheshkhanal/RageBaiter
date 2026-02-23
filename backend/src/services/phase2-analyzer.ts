import type { ByokProvider, Phase1Analysis, Phase2Analysis } from "@ragebaiter/shared";

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

type OpenAiResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

type AnthropicResponse = {
  content?: Array<{
    type?: string;
    text?: string;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
};

type GoogleResponse = {
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

type Phase2AnalyzerLogger = {
  info: (message: string) => void;
  warn: (message: string) => void;
};

export type Phase2Provider = "openai" | "anthropic" | "google";

export type Phase2Options = {
  provider?: Phase2Provider;
  apiKey?: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  requestTimeoutMs?: number;
  maxInputChars?: number;
  logger?: Phase2AnalyzerLogger;
};

const OPENAI_MODEL = "gpt-4o-mini";
const ANTHROPIC_MODEL = "claude-3-5-sonnet-20241022";
const GOOGLE_MODEL = "gemini-2.0-flash";
const DEFAULT_PROVIDER: Phase2Provider = "google";
const DEFAULT_TIMEOUT_MS = 25_000;
const DEFAULT_MAX_INPUT_CHARS = 2_000;
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 250;

const readEnv = (key: string): string | undefined => {
  return (globalThis as EnvShape).process?.env?.[key];
};

const sleep = async (ms: number): Promise<void> => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
};

const isObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const truncateDeterministically = (value: string, maxChars: number): string => {
  if (value.length <= maxChars) {
    return value;
  }

  return value.slice(0, maxChars);
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

const shouldRetry = (retryableError: RetryableError): boolean => {
  if (retryableError.kind === "timeout") {
    return true;
  }
  if (retryableError.kind === "network") {
    return true;
  }

  return retryableError.status === 429 || retryableError.status >= 500;
};

const calculateBackoff = (attempt: number, retryableError: RetryableError): number => {
  if (retryableError.kind === "http" && retryableError.retryAfterMs !== null) {
    return retryableError.retryAfterMs;
  }

  return BASE_BACKOFF_MS * 2 ** (attempt - 1);
};

const providerToEnvKey = (provider: Phase2Provider): string => {
  switch (provider) {
    case "openai":
      return "OPENAI_API_KEY";
    case "anthropic":
      return "ANTHROPIC_API_KEY";
    case "google":
      return "GEMINI_API_KEY";
  }
};

const resolveProviderFromByok = (provider?: ByokProvider): Phase2Provider | undefined => {
  if (!provider) {
    return undefined;
  }

  if (provider === "openai" || provider === "anthropic" || provider === "google") {
    return provider;
  }

  return undefined;
};

const resolveApiKey = (
  provider: Phase2Provider,
  byokKey: string | undefined,
  fallbackApiKey: string | undefined
): string => {
  const candidate = (byokKey ?? fallbackApiKey ?? readEnv(providerToEnvKey(provider)) ?? "").trim();
  return candidate;
};

const buildOpenAiRequest = (prompt: string): Record<string, unknown> => {
  return {
    model: OPENAI_MODEL,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: "You are a rigorous political argument analyst. Return valid JSON only.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  };
};

const buildAnthropicRequest = (prompt: string): Record<string, unknown> => {
  return {
    model: ANTHROPIC_MODEL,
    max_tokens: 900,
    temperature: 0,
    system:
      "You are a rigorous political argument analyst. Respond with only a valid JSON object matching the requested schema.",
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  };
};

const buildGoogleRequest = (prompt: string): Record<string, unknown> => {
  return {
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
  };
};

export const buildPhase2Prompt = (tweetText: string, phase1Context: Phase1Analysis): string => {
  return [
    "You are Phase 2 in a two-phase political tweet analysis pipeline.",
    "Phase 1 context is provided for grounding only. Do not repeat Phase 1 vector or fallacies in output.",
    "Return only JSON with this exact shape and keys:",
    '{"counterArgument":"","logicFailure":"","claim":"","mechanism":"","dataCheck":"","socraticChallenge":""}',
    "Rules:",
    "- counterArgument: 2-3 concise sentences rebutting the tweet's core claim with evidence-based reasoning",
    "- logicFailure: short label for the primary logical failure",
    "- claim: extract the main factual claim as directly as possible",
    "- mechanism: 2-3 sentences explaining how the argument manipulates framing or inference",
    "- dataCheck: 2-3 sentences with concrete checks, evidence patterns, or known empirical caveats",
    "- socraticChallenge: one pointed question that exposes the key gap in reasoning",
    "- no markdown, no code fences, no extra keys",
    "",
    "Phase 1 context:",
    `- tweetVector.social: ${phase1Context.tweetVector.social}`,
    `- tweetVector.economic: ${phase1Context.tweetVector.economic}`,
    `- tweetVector.populist: ${phase1Context.tweetVector.populist}`,
    `- fallacies: ${phase1Context.fallacies.join(", ")}`,
    `- topic: ${phase1Context.topic}`,
    `- confidence: ${phase1Context.confidence}`,
    "",
    "Tweet text:",
    tweetText,
  ].join("\n");
};

export const normalizePhase2Response = (raw: unknown): Phase2Analysis | null => {
  if (!isObject(raw)) {
    return null;
  }

  const counterArgument = raw.counterArgument;
  const logicFailure = raw.logicFailure;
  const claim = raw.claim;
  const mechanism = raw.mechanism;
  const dataCheck = raw.dataCheck;
  const socraticChallenge = raw.socraticChallenge;

  if (typeof counterArgument !== "string") {
    return null;
  }
  if (typeof logicFailure !== "string") {
    return null;
  }
  if (typeof claim !== "string") {
    return null;
  }
  if (typeof mechanism !== "string") {
    return null;
  }
  if (typeof dataCheck !== "string") {
    return null;
  }
  if (typeof socraticChallenge !== "string") {
    return null;
  }

  const normalized: Phase2Analysis = {
    counterArgument: counterArgument.trim(),
    logicFailure: logicFailure.trim(),
    claim: claim.trim(),
    mechanism: mechanism.trim(),
    dataCheck: dataCheck.trim(),
    socraticChallenge: socraticChallenge.trim(),
  };

  if (
    normalized.counterArgument.length === 0 ||
    normalized.logicFailure.length === 0 ||
    normalized.claim.length === 0 ||
    normalized.mechanism.length === 0 ||
    normalized.dataCheck.length === 0 ||
    normalized.socraticChallenge.length === 0
  ) {
    return null;
  }

  return normalized;
};

const parseProviderJsonText = (text: string): Phase2Analysis | null => {
  const extracted = extractJson(text);
  if (!extracted) {
    return null;
  }

  const parsed = JSON.parse(extracted) as unknown;
  return normalizePhase2Response(parsed);
};

const requestOpenAI = async (
  apiKey: string,
  prompt: string,
  timeoutMs: number,
  logger: Phase2AnalyzerLogger,
  fetchImpl: typeof fetch,
  now: () => number
): Promise<Phase2Analysis | null> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  const startedAt = now();

  try {
    const response = await fetchImpl("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(buildOpenAiRequest(prompt)),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw {
        kind: "http",
        status: response.status,
        retryAfterMs: parseRetryAfterMs(response.headers.get("retry-after")),
      } satisfies RetryableHttpError;
    }

    const payload = (await response.json().catch(() => null)) as OpenAiResponse | null;
    const content = payload?.choices?.[0]?.message?.content ?? "";
    const normalized = parseProviderJsonText(content);

    logger.info(
      `[phase2-analyzer] provider=openai request_ms=${now() - startedAt} tokens_total=${payload?.usage?.total_tokens ?? 0} prompt_tokens=${payload?.usage?.prompt_tokens ?? 0} completion_tokens=${payload?.usage?.completion_tokens ?? 0}`
    );

    return normalized;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw { kind: "timeout" } satisfies RetryableTimeoutError;
    }

    const retryable = toRetryableError(error);
    if (retryable) {
      throw retryable;
    }

    throw { kind: "network" } satisfies RetryableNetworkError;
  } finally {
    clearTimeout(timeout);
  }
};

const requestAnthropic = async (
  apiKey: string,
  prompt: string,
  timeoutMs: number,
  logger: Phase2AnalyzerLogger,
  fetchImpl: typeof fetch,
  now: () => number
): Promise<Phase2Analysis | null> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  const startedAt = now();

  try {
    const response = await fetchImpl("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(buildAnthropicRequest(prompt)),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw {
        kind: "http",
        status: response.status,
        retryAfterMs: parseRetryAfterMs(response.headers.get("retry-after")),
      } satisfies RetryableHttpError;
    }

    const payload = (await response.json().catch(() => null)) as AnthropicResponse | null;
    const content =
      payload?.content
        ?.filter((item) => item.type === "text")
        .map((item) => item.text ?? "")
        .join("") ?? "";
    const normalized = parseProviderJsonText(content);

    const promptTokens = payload?.usage?.input_tokens ?? 0;
    const completionTokens = payload?.usage?.output_tokens ?? 0;
    logger.info(
      `[phase2-analyzer] provider=anthropic request_ms=${now() - startedAt} tokens_total=${promptTokens + completionTokens} prompt_tokens=${promptTokens} completion_tokens=${completionTokens}`
    );

    return normalized;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw { kind: "timeout" } satisfies RetryableTimeoutError;
    }

    const retryable = toRetryableError(error);
    if (retryable) {
      throw retryable;
    }

    throw { kind: "network" } satisfies RetryableNetworkError;
  } finally {
    clearTimeout(timeout);
  }
};

const requestGoogle = async (
  apiKey: string,
  prompt: string,
  timeoutMs: number,
  logger: Phase2AnalyzerLogger,
  fetchImpl: typeof fetch,
  now: () => number
): Promise<Phase2Analysis | null> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  const startedAt = now();

  try {
    const response = await fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/models/${GOOGLE_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildGoogleRequest(prompt)),
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

    const payload = (await response.json().catch(() => null)) as GoogleResponse | null;
    const content =
      payload?.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? "")
        .join("")
        .trim() ?? "";
    const normalized = parseProviderJsonText(content);

    logger.info(
      `[phase2-analyzer] provider=google request_ms=${now() - startedAt} tokens_total=${payload?.usageMetadata?.totalTokenCount ?? 0} prompt_tokens=${payload?.usageMetadata?.promptTokenCount ?? 0} completion_tokens=${payload?.usageMetadata?.candidatesTokenCount ?? 0}`
    );

    return normalized;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw { kind: "timeout" } satisfies RetryableTimeoutError;
    }

    const retryable = toRetryableError(error);
    if (retryable) {
      throw retryable;
    }

    throw { kind: "network" } satisfies RetryableNetworkError;
  } finally {
    clearTimeout(timeout);
  }
};

type ProviderRequestFn = (
  apiKey: string,
  prompt: string,
  timeoutMs: number,
  logger: Phase2AnalyzerLogger,
  fetchImpl: typeof fetch,
  now: () => number
) => Promise<Phase2Analysis | null>;

const providerRequestMap: Record<Phase2Provider, ProviderRequestFn> = {
  openai: requestOpenAI,
  anthropic: requestAnthropic,
  google: requestGoogle,
};

export const createPhase2Analyzer = (options: Phase2Options = {}) => {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleepImpl = options.sleep ?? sleep;
  const now = options.now ?? (() => Date.now());
  const logger = options.logger ?? console;
  const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxInputChars = options.maxInputChars ?? DEFAULT_MAX_INPUT_CHARS;

  return async (
    tweetId: string,
    tweetText: string,
    phase1Context: Phase1Analysis,
    byokKey?: string,
    provider?: Phase2Provider
  ): Promise<Phase2Analysis | null> => {
    const selectedProvider =
      provider ?? resolveProviderFromByok(options.provider) ?? DEFAULT_PROVIDER;
    const apiKey = resolveApiKey(selectedProvider, byokKey, options.apiKey);

    const trimmedText = tweetText.trim();
    if (trimmedText.length === 0) {
      return null;
    }

    if (apiKey.length === 0) {
      logger.warn(
        `[phase2-analyzer] provider=${selectedProvider} missing API key in BYOK/options/env for tweet=${tweetId}`
      );
      return null;
    }

    const prompt = buildPhase2Prompt(
      truncateDeterministically(trimmedText, maxInputChars),
      phase1Context
    );
    const requestProvider = providerRequestMap[selectedProvider];

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        const analysis = await requestProvider(
          apiKey,
          prompt,
          requestTimeoutMs,
          logger,
          fetchImpl,
          now
        );

        if (analysis) {
          return analysis;
        }

        if (attempt >= MAX_ATTEMPTS) {
          logger.warn(
            `[phase2-analyzer] provider=${selectedProvider} unable to normalize response after ${attempt} attempts tweet=${tweetId}`
          );
          return null;
        }

        const backoffMs = BASE_BACKOFF_MS * 2 ** (attempt - 1);
        logger.warn(
          `[phase2-analyzer] provider=${selectedProvider} empty/invalid response retry_attempt=${attempt + 1} backoff_ms=${backoffMs}`
        );
        await sleepImpl(backoffMs);
      } catch (error) {
        const retryableError = toRetryableError(error);
        const hasNextAttempt = attempt < MAX_ATTEMPTS;

        if (!retryableError || !shouldRetry(retryableError) || !hasNextAttempt) {
          logger.warn(
            `[phase2-analyzer] provider=${selectedProvider} failed after retries, returning null for tweet=${tweetId}`
          );
          return null;
        }

        const backoffMs = calculateBackoff(attempt, retryableError);
        logger.warn(
          `[phase2-analyzer] provider=${selectedProvider} retry_attempt=${attempt + 1} backoff_ms=${backoffMs}`
        );
        await sleepImpl(backoffMs);
      }
    }

    return null;
  };
};
