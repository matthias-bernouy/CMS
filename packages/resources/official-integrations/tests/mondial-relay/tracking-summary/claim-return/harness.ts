import { readFileSync } from "node:fs";
import { afterAll } from "bun:test";
import { ClaimReturnDatabase, type Scenario } from "./database";
import { expeditionNumber, expectedExternalOrderId } from "./fixtures";

type EdgeHandler = (request: Request) => Response | Promise<Response>;

const functionUrl = "https://project.supabase.co/functions/v1/cms-delivery";
const edgeFunctionUrl = new URL(
    "../../../../integrations/providers/mondial-relay/versions/1.0.0/connectors/supabase/functions/cms-delivery/index.ts",
    import.meta.url,
);
const realFetch = globalThis.fetch;
const realDeno = (globalThis as { Deno?: unknown }).Deno;
let activeFetch: typeof fetch = realFetch;
let edgeHandler: EdgeHandler | undefined;

afterAll(() => {
    globalThis.fetch = realFetch;
    (globalThis as { Deno?: unknown }).Deno = realDeno;
});

export async function useClaimReturnDatabase(scenario: Scenario = {}) {
    installGlobals();
    const database = new ClaimReturnDatabase(scenario);
    activeFetch = ((input, init) => database.respond(input, init)) as typeof fetch;
    return {
        calls: database.calls,
        events: database.events,
        requestLegacy: async (authorization = "Bearer delivery-test-key") => {
            const shipment = await edgeRequest("/shipment", { expeditionNumber }, authorization);
            if (!shipment.ok) {
                return { shipment, tracking: null };
            }
            const tracking = await edgeRequest("/tracking", { expeditionNumber }, authorization);
            return { shipment, tracking };
        },
        requestContext: async (expected = expectedExternalOrderId, authorization = "Bearer delivery-test-key") =>
            await edgeRequest(
                "/system/shipment-tracking-context",
                { expeditionNumber, expectedExternalOrderId: expected },
                authorization,
            ),
        request: async (
            path: string,
            params: Record<string, string> = {},
            authorization = "Bearer delivery-test-key",
        ) => await edgeRequest(path, params, authorization),
    };
}

function installGlobals(): void {
    (
        globalThis as {
            Deno?: { env: { get: (key: string) => string | undefined }; serve: (handler: EdgeHandler) => unknown };
        }
    ).Deno = {
        env: {
            get: (key) =>
                ({
                    CMS_DELIVERY_API_KEY: "delivery-test-key",
                    SUPABASE_URL: "https://project.supabase.co",
                    SUPABASE_SECRET_KEYS: '{"default":"sb_secret_delivery_test"}',
                    MONDIAL_RELAY_TRACKING_BRAND: "BDTEST13",
                    MONDIAL_RELAY_TRACKING_PRIVATE_KEY: "private-test-key",
                })[key],
        },
        serve(handler) {
            edgeHandler = handler;
            return { shutdown() {} };
        },
    };
    globalThis.fetch = ((input, init) => activeFetch(input, init)) as typeof fetch;
}

async function edgeRequest(path: string, params: Record<string, string>, authorization: string): Promise<Response> {
    if (!edgeHandler) {
        await loadFreshEdgeModule();
    }
    if (!edgeHandler) {
        throw new Error("cms-delivery edge handler was not registered");
    }
    const url = new URL(`${functionUrl}${path}`);
    for (const [name, value] of Object.entries(params)) {
        url.searchParams.set(name, value);
    }
    return await edgeHandler(new Request(url, { headers: { authorization } }));
}

async function loadFreshEdgeModule(): Promise<void> {
    const source = readFileSync(edgeFunctionUrl, "utf8").replace(
        /from "(\.[^"]+)"/g,
        (_match, specifier: string) => `from "${new URL(specifier, edgeFunctionUrl).href}"`,
    );
    const moduleUrl = URL.createObjectURL(new Blob([source], { type: "application/typescript" }));
    try {
        await import(moduleUrl);
    } finally {
        URL.revokeObjectURL(moduleUrl);
    }
}
