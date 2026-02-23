import type { QuotaStatus } from "@ragebaiter/shared";

type EnvShape = {
  process?: {
    env?: Record<string, string | undefined>;
  };
};

type QuotaRow = {
  user_id: number;
  analyses_used: number;
  reset_date: string;
};

type QuotaServiceOptions = {
  supabaseUrl?: string;
  serviceRoleKey?: string;
  fetchImpl?: typeof fetch;
};

type IncrementResult = {
  success: boolean;
  analysesUsed: number;
  limit: number;
  resetsAt: string;
};

type RpcQuotaStatusResponse = {
  analyses_used?: unknown;
  limit?: unknown;
  resets_at?: unknown;
  user_id?: unknown;
  reset_date?: unknown;
};

type RpcIncrementResponse = {
  success?: unknown;
  analyses_used?: unknown;
  limit?: unknown;
  resets_at?: unknown;
};

const DEFAULT_QUOTA_LIMIT = 50;

const readEnv = (key: string): string | undefined => {
  return (globalThis as EnvShape).process?.env?.[key];
};

const toUserId = (userId: string): number => {
  const parsed = Number(userId);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("User id must be a positive integer string");
  }

  return parsed;
};

const asObject = (value: unknown): Record<string, unknown> | null => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
};

const parseNumber = (value: unknown, fallback: number): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.floor(value);
  }

  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.floor(parsed);
    }
  }

  return fallback;
};

const parseIsoDate = (value: unknown): string => {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  return new Date().toISOString();
};

const normalizeRpcResult = (payload: unknown): Record<string, unknown> => {
  if (Array.isArray(payload)) {
    const first = payload[0];
    return asObject(first) ?? {};
  }

  return asObject(payload) ?? {};
};

const toQuotaRow = (payload: RpcQuotaStatusResponse): QuotaRow | null => {
  const userId = parseNumber(payload.user_id, Number.NaN);
  if (!Number.isFinite(userId)) {
    return null;
  }

  return {
    user_id: userId,
    analyses_used: parseNumber(payload.analyses_used, 0),
    reset_date: parseIsoDate(payload.reset_date),
  };
};

export class QuotaService {
  public constructor(
    private readonly supabaseUrl: string,
    private readonly serviceRoleKey: string,
    private readonly fetcher: typeof fetch = fetch
  ) {}

  public async getQuotaStatus(userId: string): Promise<QuotaStatus> {
    const payload = await this.callRpc("get_or_create_quota", userId);
    const result = payload as RpcQuotaStatusResponse;
    const fallbackRow = toQuotaRow(result);
    const used = parseNumber(result.analyses_used, fallbackRow?.analyses_used ?? 0);
    const limit = parseNumber(result.limit, DEFAULT_QUOTA_LIMIT);
    const resetsAt = parseIsoDate(result.resets_at ?? fallbackRow?.reset_date);

    return {
      used,
      limit,
      remaining: Math.max(0, limit - used),
      resetsAt,
      hasOwnKey: false,
    };
  }

  public async incrementQuota(userId: string): Promise<IncrementResult> {
    const payload = await this.callRpc("increment_quota", userId);
    const result = payload as RpcIncrementResponse;

    return {
      success: result.success === true,
      analysesUsed: parseNumber(result.analyses_used, 0),
      limit: parseNumber(result.limit, DEFAULT_QUOTA_LIMIT),
      resetsAt: parseIsoDate(result.resets_at),
    };
  }

  public async hasQuotaRemaining(userId: string): Promise<boolean> {
    const status = await this.getQuotaStatus(userId);
    return status.remaining > 0;
  }

  private async callRpc(functionName: string, userId: string): Promise<Record<string, unknown>> {
    if (!this.supabaseUrl || !this.serviceRoleKey) {
      throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
    }

    const response = await this.fetcher(`${this.supabaseUrl}/rest/v1/rpc/${functionName}`, {
      method: "POST",
      headers: {
        apikey: this.serviceRoleKey,
        Authorization: `Bearer ${this.serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_user_id: toUserId(userId),
      }),
    });

    if (!response.ok) {
      throw new Error(`Supabase RPC ${functionName} failed: ${response.status}`);
    }

    const json = (await response.json()) as unknown;
    return normalizeRpcResult(json);
  }
}

export const createQuotaService = (options: QuotaServiceOptions = {}): QuotaService => {
  const supabaseUrl = options.supabaseUrl ?? readEnv("SUPABASE_URL") ?? "";
  const serviceRoleKey = options.serviceRoleKey ?? readEnv("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const fetchImpl = options.fetchImpl ?? fetch;

  return new QuotaService(supabaseUrl, serviceRoleKey, fetchImpl);
};

export const quotaService = createQuotaService();

export type { IncrementResult, QuotaRow, QuotaServiceOptions };
