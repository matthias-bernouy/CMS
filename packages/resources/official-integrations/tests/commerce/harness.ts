import { afterAll, beforeEach, expect } from "bun:test";
import { handleCommerceRequest } from "../../integrations/domains/commerce/versions/1.0.0/connectors/supabase/functions/cms-commerce/handler.ts";

export type JsonRecord = Record<string, unknown>;
export type CapturedFetch = {
    url: string;
    method: string;
    headers: Headers;
    body: JsonRecord;
};

export const commerceApiKey = "commerce-api-key";
export const supabaseUrl = "https://project.supabase.co";
const realFetch = globalThis.fetch;
const realDeno = (globalThis as { Deno?: unknown }).Deno;
const fetches: CapturedFetch[] = [];
let restResponder: (request: Request) => Response | Promise<Response>;

export function installCommerceTestEnvironment(): void {
    (globalThis as { Deno?: { env: { get: (key: string) => string | undefined } } }).Deno = {
        env: {
            get(key) {
                return {
                    CMS_COMMERCE_API_KEY: commerceApiKey,
                    SUPABASE_URL: supabaseUrl,
                    SUPABASE_SECRET_KEYS: JSON.stringify({ default: "sb_secret_test" }),
                }[key];
            },
        },
    };
    globalThis.fetch = captureFetch;
    beforeEach(() => {
        fetches.length = 0;
        restResponder = () => jsonResponse({ id: 1 });
    });
    afterAll(() => {
        globalThis.fetch = realFetch;
        (globalThis as { Deno?: unknown }).Deno = realDeno;
    });
}

export function setRestResponder(responder: typeof restResponder): void {
    restResponder = responder;
}

export function capturedFetches(): CapturedFetch[] {
    return fetches.map((fetch) => ({
        ...fetch,
        headers: new Headers(fetch.headers),
        body: structuredClone(fetch.body),
    }));
}

export async function requestCommerce(
    path: string,
    options: {
        method?: string;
        authenticated?: boolean;
        authorization?: string;
        userId?: string;
        userRole?: string | null;
        body?: JsonRecord;
        formData?: FormData;
    } = {},
): Promise<Response> {
    return handleCommerceRequest(commerceRequest(path, options));
}

export function expectSingleRpc(name: string): CapturedFetch {
    expect(fetches).toHaveLength(1);
    return expectRpc(name);
}

export function expectRpc(name: string): CapturedFetch {
    const calls = fetches.filter((call) => call.url === `${supabaseUrl}/rest/v1/rpc/${name}`);
    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.url).toBe(`${supabaseUrl}/rest/v1/rpc/${name}`);
    expect(call.method).toBe("POST");
    expect(call.headers.get("apikey")).toBe("sb_secret_test");
    expect(call.headers.get("authorization")).toBeNull();
    expect(call.headers.get("accept-profile")).toBe("commerce");
    expect(call.headers.get("content-profile")).toBe("commerce");
    return call;
}

export function jsonResponse(value: unknown, status = 200, headers: HeadersInit = {}): Response {
    return new Response(JSON.stringify(value), {
        status,
        headers: { "content-type": "application/json", ...Object.fromEntries(new Headers(headers)) },
    });
}

const captureFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const text = await request.clone().text();
    fetches.push({
        url: request.url,
        method: request.method,
        headers: new Headers(request.headers),
        body:
            text && request.headers.get("content-type")?.includes("application/json")
                ? (JSON.parse(text) as JsonRecord)
                : {},
    });
    return restResponder(request);
}) as typeof fetch;

function commerceRequest(
    path: string,
    options: {
        method?: string;
        authenticated?: boolean;
        authorization?: string;
        userId?: string;
        userRole?: string | null;
        body?: JsonRecord;
        formData?: FormData;
    },
): Request {
    const headers = new Headers();
    if (options.authenticated !== false) {
        headers.set("authorization", options.authorization ?? `Bearer ${commerceApiKey}`);
    }
    if (options.userId) {
        headers.set("x-cms-user-id", options.userId);
    }
    const userRole = options.userRole === undefined && path.startsWith("/admin/") ? "admin" : options.userRole;
    if (userRole) {
        headers.set("x-cms-user-role", userRole);
    }
    if (options.body) {
        headers.set("content-type", "application/json");
    }
    return new Request(`https://cms.example.test/functions/v1/cms-commerce${path}`, {
        method: options.method ?? (options.body || options.formData ? "POST" : "GET"),
        headers,
        body: options.body ? JSON.stringify(options.body) : options.formData,
    });
}
