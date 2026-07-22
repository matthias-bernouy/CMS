import { afterAll, setSystemTime } from "bun:test";
import { databaseResponse, observedAt, providerResponse, providerUrl, shipmentRow } from "./fixture";

export { observedAt, providerUrl, rawToken, shipmentRow, tokenHash } from "./fixture";

export type JsonRecord = Record<string, unknown>;

export type LabelScenario = {
    token?: "valid" | "missing" | "revoked" | "expired";
    tokenExpiresAt?: string;
    databaseClockAt?: string;
    shipment?: JsonRecord | null;
    rpcResponse?: unknown;
    provider?: "pdf" | "redirect" | "missing" | "html";
};

export type ObservedCall = {
    kind: "database" | "provider";
    method: string;
    pathname: string;
    url: string;
    redirect: RequestRedirect;
    headers: Record<string, string>;
    body?: unknown;
};

type EdgeHandler = (request: Request) => Response | Promise<Response>;

const apiKey = "cms-delivery-contract-key";
const supabaseUrl = "https://delivery-contract.supabase.co";
const functionUrl = "https://delivery-contract.supabase.co/functions/v1/cms-delivery/label";
const edgeModule =
    "../../../integrations/providers/mondial-relay/versions/1.0.0/connectors/supabase/functions/cms-delivery/index.ts";
const realDeno = (globalThis as { Deno?: unknown }).Deno;
const realFetch = globalThis.fetch;
let edgeHandler: EdgeHandler | undefined;
let activeFetch: typeof fetch = realFetch;

installGlobals();

afterAll(() => {
    setSystemTime();
    globalThis.fetch = realFetch;
    (globalThis as { Deno?: unknown }).Deno = realDeno;
});

export async function useLabelScenario(scenario: LabelScenario = {}) {
    setSystemTime(new Date(observedAt));
    installGlobals();
    const calls: ObservedCall[] = [];
    const tokenState = scenario.token ?? "valid";
    const shipment = scenario.shipment === undefined ? shipmentRow() : scenario.shipment;
    activeFetch = async (input, init) => {
        const request = input instanceof Request && !init ? input : new Request(input, init);
        const url = new URL(request.url);
        const text = request.method === "GET" ? "" : await request.clone().text();
        calls.push(observe(request, url, text, url.origin === supabaseUrl ? "database" : "provider"));
        if (url.origin === supabaseUrl) {
            if (scenario.databaseClockAt) {
                setSystemTime(new Date(scenario.databaseClockAt));
            }
            return databaseResponse(request, url, text, scenario, tokenState, shipment);
        }
        if (request.url === providerUrl) {
            return providerResponse(scenario.provider);
        }
        throw new Error(`unexpected request: ${request.method} ${request.url}`);
    };
    const handler = await loadEdgeHandler();
    return {
        calls,
        request: async (options: { token?: string; seller?: string; authorization?: string | null } = {}) => {
            const url = new URL(functionUrl);
            if (options.token !== undefined) {
                url.searchParams.set("token", options.token);
            }
            const headers = new Headers();
            if (options.authorization !== null) {
                headers.set("authorization", options.authorization ?? `Bearer ${apiKey}`);
            }
            if (options.seller !== undefined) {
                headers.set("x-cms-user-id", options.seller);
            }
            return await handler(new Request(url, { headers }));
        },
    };
}

function observe(request: Request, url: URL, text: string, kind: ObservedCall["kind"]): ObservedCall {
    return {
        kind,
        method: request.method,
        pathname: url.pathname,
        url: request.url,
        redirect: request.redirect,
        headers: Object.fromEntries(request.headers),
        ...(text ? { body: JSON.parse(text) as unknown } : {}),
    };
}

async function loadEdgeHandler(): Promise<EdgeHandler> {
    if (!edgeHandler) {
        await import(`${edgeModule}?label-access-contract`);
    }
    if (!edgeHandler) {
        throw new Error("cms-delivery edge handler was not registered");
    }
    return edgeHandler;
}

function installGlobals(): void {
    (globalThis as { Deno?: unknown }).Deno = {
        env: {
            get: (key: string) =>
                ({
                    CMS_DELIVERY_API_KEY: apiKey,
                    SUPABASE_URL: supabaseUrl,
                    SUPABASE_SECRET_KEY: "sb_secret_label_test",
                })[key],
        },
        serve(handler: EdgeHandler) {
            edgeHandler = handler;
            return { shutdown() {} };
        },
    };
    globalThis.fetch = ((input, init) => activeFetch(input, init)) as typeof fetch;
}
