import { createFetchMock } from "./fetch-mock.ts";
import type { SaveSetupOptions, WorkerResult } from "./harness.ts";

type EdgeHandler = (request: Request) => Response | Promise<Response>;

const edgeUrl = new URL(
    "../../../../integrations/providers/mondial-relay/versions/1.0.0/connectors/supabase/functions/cms-delivery/index.ts",
    import.meta.url,
).href;
let handler: EdgeHandler | undefined;

(globalThis as { Deno?: unknown }).Deno = {
    env: {
        get(name: string): string | undefined {
            return {
                CMS_DELIVERY_API_KEY: "delivery-test-key",
                MONDIAL_RELAY_WIDGET_BRAND: "BDTEST",
                SUPABASE_URL: "https://project.supabase.co",
                SUPABASE_SECRET_KEY: "sb_secret_delivery_test",
            }[name];
        },
    },
    serve(candidate: EdgeHandler) {
        handler = candidate;
        return { shutdown() {} };
    },
};

self.onmessage = async (event: MessageEvent<SaveSetupOptions>) => {
    try {
        postMessage(await run(event.data));
    } catch (error) {
        const result: WorkerResult = {
            status: 0,
            body: "",
            logicalSteps: [],
            requests: [],
            error: error instanceof Error ? (error.stack ?? error.message) : String(error),
        };
        postMessage(result);
    }
};

async function run(options: SaveSetupOptions): Promise<WorkerResult> {
    const mock = createFetchMock(options);
    globalThis.fetch = mock.fetchImpl;
    await import(edgeUrl);
    if (!handler) {
        throw new Error("cms-delivery edge handler was not registered");
    }
    const headers = new Headers({ "content-type": "application/json" });
    if (options.authorization !== null) {
        headers.set("authorization", options.authorization ?? "");
    }
    if (options.userId !== null) {
        headers.set("x-cms-user-id", options.userId ?? "");
    }
    const path =
        options.route === "claim-return"
            ? "/cms-delivery/system/claim-return-relay-selections"
            : "/cms-delivery/relay-selections";
    const response = await handler(
        new Request(`https://edge.test${path}`, {
            method: "POST",
            headers,
            body: JSON.stringify(options.body),
        }),
    );
    return {
        status: response.status,
        body: await response.text(),
        logicalSteps: mock.logicalSteps,
        requests: mock.requests,
    };
}
