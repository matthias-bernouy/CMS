import { afterAll, beforeEach } from "bun:test";
import { handleSalesConfiguratorRequest } from "../../../../integrations/domains/sales-configurator/versions/1.0.0/connectors/supabase/functions/cms-sales-configurator/handler";

export type JsonRecord = Record<string, unknown>;
export interface CapturedRequest {
    url: URL;
    method: string;
    headers: Headers;
    body: JsonRecord;
}

const apiKey = "sales-configurator-test-key";
const supabaseUrl = "https://sales-configurator.supabase.co";
const originalDeno = (globalThis as { Deno?: unknown }).Deno;
const originalFetch = globalThis.fetch;
const captured: CapturedRequest[] = [];
let responder: (request: Request) => Response | Promise<Response>;

export function installConnectorHarness(): void {
    (globalThis as { Deno?: { env: { get: (key: string) => string | undefined } } }).Deno = {
        env: {
            get: (key) =>
                ({
                    CMS_SALES_CONFIGURATOR_API_KEY: apiKey,
                    SUPABASE_URL: supabaseUrl,
                    SUPABASE_SECRET_KEYS: JSON.stringify({ default: "sb_secret_test" }),
                })[key],
        },
    };
    globalThis.fetch = captureFetch;
    beforeEach(() => {
        captured.length = 0;
        responder = defaultResponder;
    });
    afterAll(() => {
        globalThis.fetch = originalFetch;
        (globalThis as { Deno?: unknown }).Deno = originalDeno;
    });
}

export function setResponder(value: typeof responder): void {
    responder = value;
}

export function requests(): CapturedRequest[] {
    return captured;
}

export function connectorRequest(
    path: string,
    options: {
        key?: string | null;
        userId?: string;
        userRole?: string;
        body?: JsonRecord;
    } = {},
): Promise<Response> {
    const headers = new Headers();
    if (options.key !== null) {
        headers.set("authorization", `Bearer ${options.key ?? apiKey}`);
    }
    if (options.userId) {
        headers.set("x-cms-user-id", options.userId);
    }
    if (options.userRole) {
        headers.set("x-cms-user-role", options.userRole);
    }
    if (options.body) {
        headers.set("content-type", "application/json");
    }
    return handleSalesConfiguratorRequest(
        new Request(`https://cms.example.test/functions/v1/cms-sales-configurator${path}`, {
            method: options.body ? "POST" : "GET",
            headers,
            body: options.body ? JSON.stringify(options.body) : undefined,
        }),
    );
}

export function response(value: unknown, status = 200): Response {
    return new Response(JSON.stringify(value), {
        status,
        headers: { "content-type": "application/json" },
    });
}

async function captureFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const request = new Request(input, init);
    const raw = await request.clone().text();
    captured.push({
        url: new URL(request.url),
        method: request.method,
        headers: new Headers(request.headers),
        body: raw ? (JSON.parse(raw) as JsonRecord) : {},
    });
    return await responder(request);
}

function defaultResponder(request: Request): Response {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/partner_accounts")) {
        return response([{ id: 7, cms_user_id: "partner-a", display_name: "Partner A" }]);
    }
    if (url.pathname.endsWith("/partner_capabilities")) {
        return response([{ partner_account_id: 7, capability: "proposals.manage" }]);
    }
    return response({ id: 1 });
}
