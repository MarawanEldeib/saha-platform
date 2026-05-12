// SAH-159: shared Supabase mock — recording proxy chain that serves
// canned `{ data, error }` responses keyed by `table:op` or `rpc:name`.
// Extracted from the stripe-webhook test harness so booking-flow tests
// and any future action tests can re-use it.

import { vi } from "vitest";

export interface MockResponse {
    data?: unknown;
    error?: { code?: string; message?: string } | null;
    count?: number | null;
}

export interface CallLog {
    table: string;
    op: "select" | "insert" | "update" | "delete" | "upsert";
    args: unknown[];
    chain: Array<[string, unknown[]]>;
}

export interface RpcLog {
    name: string;
    args: unknown;
}

export interface SupabaseMock {
    supabase: {
        from: (table: string) => unknown;
        rpc: (name: string, args: unknown) => Promise<MockResponse>;
        auth: {
            getUser: ReturnType<typeof vi.fn>;
            admin: { getUserById: ReturnType<typeof vi.fn> };
            mfa: { getAuthenticatorAssuranceLevel: ReturnType<typeof vi.fn> };
        };
        storage: { from: (b: string) => { upload: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> } };
    };
    setResponse: (key: string, response: MockResponse) => void;
    calls: CallLog[];
    rpcCalls: RpcLog[];
}

export function createSupabaseMock(): SupabaseMock {
    const calls: CallLog[] = [];
    const rpcCalls: RpcLog[] = [];
    const responses = new Map<string, MockResponse>();

    function setResponse(key: string, response: MockResponse) {
        responses.set(key, response);
    }

    function buildChain(table: string, op: CallLog["op"], opArgs: unknown[]): unknown {
        const call: CallLog = { table, op, args: opArgs, chain: [] };
        calls.push(call);
        const key = `${table}:${op}`;
        const target = {} as Record<string | symbol, unknown>;
        const proxy: unknown = new Proxy(target, {
            get(_t, prop: string | symbol) {
                if (prop === "then") {
                    const response = responses.get(key) ?? { data: null, error: null };
                    return (resolve: (v: MockResponse) => void) => resolve(response);
                }
                if (prop === "single" || prop === "maybeSingle") {
                    return () => {
                        const response = responses.get(key) ?? { data: null, error: null };
                        return Promise.resolve(response);
                    };
                }
                if (typeof prop === "symbol") return undefined;
                // eq / in / order / range / limit / ilike / gte / lte / select / etc — record and return self.
                return (...args: unknown[]) => {
                    call.chain.push([prop, args]);
                    return proxy;
                };
            },
        });
        return proxy;
    }

    const supabase = {
        from(table: string) {
            return {
                select: (...args: unknown[]) => buildChain(table, "select", args),
                insert: (rows: unknown) => buildChain(table, "insert", [rows]),
                update: (values: unknown) => buildChain(table, "update", [values]),
                delete: () => buildChain(table, "delete", []),
                upsert: (rows: unknown, opts?: unknown) => buildChain(table, "upsert", [rows, opts]),
            };
        },
        rpc(name: string, args: unknown) {
            rpcCalls.push({ name, args });
            const response = responses.get(`rpc:${name}`) ?? { data: null, error: null };
            return Promise.resolve(response);
        },
        auth: {
            getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
            admin: {
                getUserById: vi.fn(async () => ({ data: { user: null } })),
            },
            mfa: {
                getAuthenticatorAssuranceLevel: vi.fn(async () => ({
                    data: { currentLevel: "aal2", nextLevel: "aal2" },
                })),
            },
        },
        storage: {
            from: (_bucket: string) => ({
                upload: vi.fn(async () => ({ data: null, error: null })),
                remove: vi.fn(async () => ({ data: null, error: null })),
            }),
        },
    };

    return { supabase, setResponse, calls, rpcCalls };
}
