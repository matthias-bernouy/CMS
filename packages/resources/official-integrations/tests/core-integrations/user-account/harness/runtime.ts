import { afterAll } from "bun:test";
import type { EdgeHandler } from "./types";

export const sourcePrefix = "/.cms/sources/";
export const functionsBaseUrl = "https://project.supabase.co/functions/v1";
export const supabaseUrl = "https://project.supabase.co";

const edgeFunctionUrl =
    "../../../../integrations/user-account/versions/1.0.0/connectors/supabase/functions/cms-user-account/index.ts";
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
    globalThis.fetch = realFetch;
    (globalThis as { Deno?: unknown }).Deno = realDeno;
});

export function setActiveEnv(next: Record<string, string>): void {
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
        throw new Error("cms-user-account edge handler was not registered");
    }
    return edgeHandler;
}
