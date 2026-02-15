import { vi } from "vitest";

export type SupabaseSelectResult<T> = { data: T[]; error: null };

export const createSupabaseClientMock = <TRecord extends Record<string, unknown>>(
  seed: TRecord[] = []
) => {
  const rows = [...seed];

  const select = vi.fn(
    async (): Promise<SupabaseSelectResult<TRecord>> => ({
      data: rows,
      error: null,
    })
  );

  const insert = vi.fn(async (payload: TRecord | TRecord[]) => {
    const nextRows = Array.isArray(payload) ? payload : [payload];
    rows.push(...nextRows);

    return {
      data: nextRows,
      error: null,
    };
  });

  const from = vi.fn((_table: string) => ({
    select,
    insert,
  }));

  return {
    from,
    __rows: rows,
    __spies: {
      from,
      select,
      insert,
    },
  };
};
