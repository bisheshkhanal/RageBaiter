type EnvShape = {
  process?: {
    env?: Record<string, string | undefined>;
  };
};

/**
 * Internal numeric user id from public.users.id (bigint-backed).
 */
export type InternalUserId = number;

/**
 * Repository interface for user identity lookups.
 * Used by services that need to resolve auth UUIDs to internal user ids.
 */
export type UserIdentityRepository = {
  /**
   * Resolves a Supabase auth UUID to the internal numeric user id.
   * Returns null if the user does not exist.
   */
  getInternalUserId(authId: string): Promise<InternalUserId | null>;
};

export type UserIdentityServiceInterface = {
  resolveUserId(authId: string): Promise<InternalUserId>;
  tryResolveUserId(authId: string): Promise<InternalUserId | null>;
};

const readEnv = (key: string): string | undefined => {
  return (globalThis as EnvShape).process?.env?.[key];
};

/**
 * Supabase REST-based implementation of UserIdentityRepository.
 * Queries public.users table to resolve auth_id to internal numeric id.
 */
export class SupabaseUserIdentityRepository implements UserIdentityRepository {
  public constructor(
    private readonly supabaseUrl: string,
    private readonly serviceRoleKey: string,
    private readonly fetcher: typeof fetch = fetch
  ) {}

  public static fromEnv(fetcher?: typeof fetch): SupabaseUserIdentityRepository | null {
    const supabaseUrl = readEnv("SUPABASE_URL");
    const serviceRoleKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return null;
    }

    return new SupabaseUserIdentityRepository(supabaseUrl, serviceRoleKey, fetcher);
  }

  public async getInternalUserId(authId: string): Promise<InternalUserId | null> {
    const url = new URL(`${this.supabaseUrl}/rest/v1/users`);
    url.searchParams.set("auth_id", `eq.${authId}`);
    url.searchParams.set("select", "id");
    url.searchParams.set("limit", "1");

    const response = await this.fetcher(url, {
      method: "GET",
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Supabase user identity lookup failed: ${response.status}`);
    }

    const rows = (await response.json()) as Array<{ id: number }>;
    const userId = rows[0]?.id;

    return typeof userId === "number" ? userId : null;
  }

  private getHeaders(): Record<string, string> {
    return {
      apikey: this.serviceRoleKey,
      Authorization: `Bearer ${this.serviceRoleKey}`,
    };
  }
}

/**
 * Service for resolving Supabase auth UUIDs to internal user ids.
 * This is the translation boundary for quota-backed flows and other
 * services that require bigint-backed internal user ids.
 */
export class UserIdentityService {
  public constructor(private readonly repository: UserIdentityRepository) {}

  /**
   * Resolves a Supabase auth UUID to the internal numeric user id.
   * Throws if the user is not found in the database.
   */
  public async resolveUserId(authId: string): Promise<InternalUserId> {
    const userId = await this.repository.getInternalUserId(authId);

    if (userId === null) {
      throw new Error(`User not found for auth id: ${authId}`);
    }

    return userId;
  }

  /**
   * Attempts to resolve a Supabase auth UUID to the internal numeric user id.
   * Returns null if the user is not found, without throwing.
   */
  public async tryResolveUserId(authId: string): Promise<InternalUserId | null> {
    return this.repository.getInternalUserId(authId);
  }
}

export type UserIdentityServiceOptions = {
  supabaseUrl?: string;
  serviceRoleKey?: string;
  fetchImpl?: typeof fetch;
  repository?: UserIdentityRepository;
};

export const createUserIdentityService = (
  options: UserIdentityServiceOptions = {}
): UserIdentityService => {
  const repository =
    options.repository ??
    new SupabaseUserIdentityRepository(
      options.supabaseUrl ?? readEnv("SUPABASE_URL") ?? "",
      options.serviceRoleKey ?? readEnv("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      options.fetchImpl ?? fetch
    );

  return new UserIdentityService(repository);
};

/**
 * Default user identity service instance using environment configuration.
 */
export const userIdentityService = createUserIdentityService();
