import type { EdgeHandler } from "./types";

let realFetch = globalThis.fetch;
let realDeno = (globalThis as { Deno?: unknown }).Deno;
export let activeEnv: Record<string, string> = {};
let activeFetch: typeof fetch = realFetch;
export let edgeHandler: EdgeHandler | undefined;

export function installStripeConnectRuntime(): void {
    realFetch = globalThis.fetch;
    realDeno = (globalThis as { Deno?: unknown }).Deno;
    activeEnv = {};
    activeFetch = realFetch;
    edgeHandler = undefined;
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
}

export function setActiveEnvironment(environment: Record<string, string>): void {
    activeEnv = environment;
}

export function setActiveFetch(fetchImplementation: typeof fetch): void {
    activeFetch = fetchImplementation;
}

export async function loadEdgeHandler(loadModule: () => Promise<unknown>): Promise<EdgeHandler> {
    if (!edgeHandler) {
        await loadModule();
    }
    if (!edgeHandler) {
        throw new Error("cms-stripe-connect edge handler was not registered");
    }
    return edgeHandler;
}

export function restoreStripeConnectRuntime(): void {
    globalThis.fetch = realFetch;
    (globalThis as { Deno?: unknown }).Deno = realDeno;
}
