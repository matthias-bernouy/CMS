import { readFileSync } from "node:fs";
import { afterAll } from "bun:test";
import { type Scenario, TrackingDatabase } from "./database";
import { trackingLink } from "./fixtures";

type EdgeHandler = (request: Request) => Response | Promise<Response>;

const functionUrl = "https://project.supabase.co/functions/v1/cms-delivery";
const supabaseUrl = "https://project.supabase.co";
const edgeFunctionUrl = new URL(
    "../../../integrations/mondial-relay/versions/1.0.0/connectors/supabase/functions/cms-delivery/index.ts",
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

export async function useTrackingDatabase(scenario: Scenario = {}) {
    installGlobals();
    const database = new TrackingDatabase(scenario);
    activeFetch = ((input, init) => database.respond(input, init)) as typeof fetch;

    return {
        calls: database.calls,
        reads: database.reads,
        events: database.events,
        eventReadCount: () => database.eventReadCount(),
        pauseEvents: () => database.pauseEvents(),
        request: async (url = trackingLink) => await requestTrackingSummary(url),
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
                    SUPABASE_URL: supabaseUrl,
                    SUPABASE_SECRET_KEYS: '{"default":"sb_secret_delivery_test"}',
                })[key],
        },
        serve(handler) {
            edgeHandler = handler;
            return { shutdown() {} };
        },
    };
    globalThis.fetch = ((input, init) => activeFetch(input, init)) as typeof fetch;
}

async function requestTrackingSummary(url: string): Promise<Response> {
    if (!edgeHandler) {
        await loadFreshEdgeModule();
    }
    if (!edgeHandler) {
        throw new Error("cms-delivery edge handler was not registered");
    }
    const requestUrl = new URL(`${functionUrl}/parse-tracking-link`);
    requestUrl.searchParams.set("url", url);
    return await edgeHandler(new Request(requestUrl, { headers: { authorization: "Bearer delivery-test-key" } }));
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
