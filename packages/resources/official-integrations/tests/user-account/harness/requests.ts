import { File } from "node:buffer";
import { handleSourceRequest } from "@bernouy/cms-sources";
import type { Harness } from "./create";
import { sourcePrefix } from "./runtime";

export async function sourceRequest(
    harness: Harness,
    endpoint: string,
    params: Record<string, string> = {},
): Promise<Response> {
    const url = new URL(`http://cms.local${sourcePrefix}user-account/${endpoint}`);
    for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
    }
    return await proxySource(harness, new Request(url));
}

export async function sourceJson(
    harness: Harness,
    endpoint: string,
    body: unknown,
    params: Record<string, string> = {},
): Promise<Response> {
    const url = new URL(`http://cms.local${sourcePrefix}user-account/${endpoint}`);
    for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
    }
    return await proxySource(
        harness,
        new Request(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        }),
    );
}

export async function sourceUpload(
    harness: Harness,
    endpoint: string,
    file: File,
    params: Record<string, string> = {},
): Promise<Response> {
    const form = new FormData();
    form.set("file", file);
    const url = new URL(`http://cms.local${sourcePrefix}user-account/${endpoint}`);
    for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
    }
    return await proxySource(harness, new Request(url, { method: "POST", body: form }));
}

export async function sourceDelete(
    harness: Harness,
    endpoint: string,
    params: Record<string, string>,
): Promise<Response> {
    const url = new URL(`http://cms.local${sourcePrefix}user-account/${endpoint}`);
    for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
    }
    return await proxySource(harness, new Request(url, { method: "DELETE" }));
}

async function proxySource(harness: Harness, request: Request): Promise<Response> {
    return await handleSourceRequest(harness.sources, request, {
        prefix: sourcePrefix,
        deps: {
            fetchImpl: harness.sourceFetch,
            resolveSecret: harness.resolveSecret,
            resolveContext: async () => ({ userID: "user-123" }),
        },
    });
}
