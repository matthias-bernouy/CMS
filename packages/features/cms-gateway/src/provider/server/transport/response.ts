import type { HttpBoundCapability } from "./routes";
import type { ProviderBinaryResult } from "../dispatch/registry";
import { ProviderCapabilityDispatchError } from "../dispatch/registry";
import { parseResourceMetadata } from "cms-gateway/invocation/resource/metadata";
import { RESPONSE_HEADERS, selectResponseHeaders, snapshotHeaders } from "cms-gateway/protocol/http/headers";
import { parseStrictJson, MAX_CAPABILITY_JSON_BYTES } from "@bernouy/cms-repository/contracts/protocol";
import { readBounded } from "cms-gateway/invocation/http/transport/readBounded";

export function validateResponseHeaders(
    value: Readonly<Record<string, string>> = {},
): Readonly<Record<string, string>> {
    return snapshotHeaders(
        Object.fromEntries(Object.entries(value).map(([name, content]) => [name.toLowerCase(), content])),
        RESPONSE_HEADERS,
    );
}
/** Adapts Fetch responses without consuming binary streams. Structured outcomes remain schema checked by the relay. */
export async function adaptProviderResponse(
    response: Response,
    capability: HttpBoundCapability,
    method: string,
    metadata?: { readonly vary?: readonly string[]; readonly cacheTags?: readonly string[] },
    signal: AbortSignal = new AbortController().signal,
    revalidating = false,
): Promise<{ output: unknown; headers?: Readonly<Record<string, string>>; status?: number; notModified?: true }> {
    try {
        if (response.headers.has("content-encoding") && response.headers.get("content-encoding") !== "identity") {
            throw new TypeError("Return unencoded bytes; the transport owns compression");
        }
        if (capability.output.type === "binary" && capability.output.resource) {
            const permitted = new Set([...RESPONSE_HEADERS, "content-type", "content-length", "x-robots-tag"]);
            const resource = parseResourceMetadata({
                ...metadata,
                status: response.status,
                headers: Object.fromEntries([...response.headers].filter(([name]) => permitted.has(name))),
                vary:
                    metadata?.vary ??
                    response.headers
                        .get("vary")
                        ?.split(",")
                        .map((name) => name.trim().toLowerCase())
                        .filter(Boolean),
            });
            const bodyless = method === "HEAD" || [204, 205, 301, 302, 303, 304, 307, 308].includes(response.status);
            if (bodyless) {
                await response.body?.cancel();
            }
            const output: ProviderBinaryResult = {
                kind: "binary",
                resource,
                contentType: capability.binding.response.contentTypes[0] ?? "application/octet-stream",
                stream:
                    bodyless || !response.body
                        ? new ReadableStream({ start: (controller) => controller.close() })
                        : response.body,
                ...(bodyless || !response.body ? { contentLength: 0 } : {}),
            };
            return { output };
        }
        if (metadata) {
            throw new TypeError("Resource cache metadata requires a native resource capability");
        }
        const headers = selectResponseHeaders(response.headers);
        if (
            response.status === 304 &&
            revalidating &&
            capability.behavior.effect === "query" &&
            capability.behavior.execution === "sync"
        ) {
            await response.body?.cancel();
            return { output: undefined, headers, status: 304, notModified: true };
        }
        if (
            capability.output.type === "binary" &&
            capability.binding.response.successStatuses.includes(response.status)
        ) {
            const contentLength = responseLength(response, capability.output.maxBytes);
            return {
                output: {
                    kind: "binary",
                    stream: response.body ?? new ReadableStream({ start: (controller) => controller.close() }),
                    contentType: response.headers.get("content-type") ?? "application/octet-stream",
                    status: response.status,
                    ...(contentLength === undefined ? {} : { contentLength }),
                    headers,
                },
            };
        }
        if (
            response.headers.get("content-type")?.split(";", 1)[0]?.trim() !== "application/json" &&
            ![204, 205].includes(response.status)
        ) {
            throw new TypeError("Structured capability responses require JSON");
        }
        const bytes = await readBounded(response, MAX_CAPABILITY_JSON_BYTES, signal);
        const output = bytes.byteLength ? parseStrictJson(bytes, MAX_CAPABILITY_JSON_BYTES, 64) : null;
        if (!capability.binding.response.successStatuses.includes(response.status)) {
            const error = (output as { error?: { code?: unknown; output?: unknown } })?.error;
            if (
                typeof error?.code !== "string" ||
                capability.binding.response.errorStatuses[error.code] !== response.status
            ) {
                throw new TypeError("Undeclared provider response status");
            }
            throw new ProviderCapabilityDispatchError(error.code, response.status, error.code, headers, error.output);
        }
        return { output, headers, status: response.status };
    } catch (error) {
        await response.body?.cancel().catch(() => undefined);
        throw error;
    }
}

function responseLength(response: Response, maximum: number): number | undefined {
    const value = response.headers.get("content-length");
    if (value === null) {
        return undefined;
    }
    const length = Number(value);
    if (!/^(?:0|[1-9][0-9]*)$/u.test(value) || !Number.isSafeInteger(length) || length > maximum) {
        throw new TypeError("Binary response length exceeds the admitted bound");
    }
    return length;
}
