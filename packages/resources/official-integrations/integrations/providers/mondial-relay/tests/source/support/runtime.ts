import { afterAll, setSystemTime } from "bun:test";

export type EdgeHandler = (request: Request) => Response | Promise<Response>;
export type JsonRecord = Record<string, unknown>;
export type ObservedFetchRequest = {
    method: string;
    url: string;
    pathname: string;
    searchParams: Record<string, string>;
    body?: unknown;
};
export type ObservedFetchStep = {
    kind: "postgrest" | "provider";
    method: string;
    pathname: string;
};

export const sourcePrefix = "/.cms/sources/";
export const functionsBaseUrl = "https://project.supabase.co/functions/v1";
export const supabaseUrl = "https://project.supabase.co";
export const connectEndpoint = "https://connect-api-sandbox.mondialrelay.com/api/shipment";
export const trackingEndpoint = "https://api.mondialrelay.com/WebService.asmx";
export const definitionUrl = new URL("../../../definition.json", import.meta.url);
const edgeFunctionUrl = "../../../connectors/supabase/functions/cms-delivery/index.ts";

const realFetch = globalThis.fetch;
const realDeno = (globalThis as { Deno?: unknown }).Deno;
export let activeEnv: Record<string, string> = {};
let activeFetch: typeof fetch = realFetch;
let edgeHandler: EdgeHandler | undefined;

(
    globalThis as {
        Deno?: { env: { get: (key: string) => string | undefined }; serve: (handler: EdgeHandler) => unknown };
    }
).Deno = {
    env: { get: (key) => activeEnv[key] },
    serve(handler) {
        edgeHandler = handler;
        return {
            shutdown() {
                /* test stub */
            },
        };
    },
};
globalThis.fetch = ((input, init) => activeFetch(input, init)) as typeof fetch;

afterAll(() => {
    setSystemTime();
    globalThis.fetch = realFetch;
    (globalThis as { Deno?: unknown }).Deno = realDeno;
});

export function setActiveEnvironment(next: Record<string, string>): void {
    activeEnv = next;
}

export function setActiveFetch(next: typeof fetch): void {
    activeFetch = next;
}

export async function loadEdgeHandler(): Promise<EdgeHandler> {
    if (!edgeHandler) {
        await import(edgeFunctionUrl);
    }
    if (!edgeHandler) {
        throw new Error("cms-delivery edge handler was not registered");
    }
    return edgeHandler;
}
