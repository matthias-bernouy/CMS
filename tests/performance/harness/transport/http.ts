import { randomUUID } from "node:crypto";
import { compileHttpBinding, encodeHttpFieldParameter, encodeHttpParameter } from "@bernouy/ulvia-contracts/bindings";
import { validateSchemaValue } from "@bernouy/ulvia-contracts/schema";
import type { UlviaScalarSchema } from "@bernouy/ulvia-contracts/schema";
import type { CapabilityTarget } from "../../capabilities/types";
import { requestKey } from "./key";

export function isolatedOrigin(value: string): string {
    const url = new URL(value);
    if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        url.pathname !== "/" ||
        !(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.hostname.endsWith(".localhost"))
    ) {
        throw new Error("Performance traffic must target an isolated loopback origin");
    }
    return url.origin;
}

export function capabilityRequest(
    origin: string,
    target: CapabilityTarget,
    bindingId: string,
    input: Readonly<Record<string, unknown>>,
    credentials: Readonly<{ cookie?: string; token?: string }> = {},
    traceId: string = randomUUID(),
    idempotencyKey?: string,
) {
    isolatedOrigin(origin);
    validateSchemaValue(target.definition.input, input);
    const definition = target.definition.bindings.find((binding) => binding.id === bindingId);
    if (!definition || definition.transport !== "http") {
        throw new Error("The requested HTTP binding is not declared by the exact target");
    }
    const compiled = compileHttpBinding(target.definition, definition);
    const parameter = (property: string, encoding: "http-field" | "uri-component" = "uri-component") => {
        const schema = target.definition.input.properties[property];
        if (!schema || !["string", "number", "integer", "boolean", "null"].includes(schema.type)) {
            throw new Error("HTTP parameter does not have a scalar schema");
        }
        return (encoding === "http-field" ? encodeHttpFieldParameter : encodeHttpParameter)(
            schema as UlviaScalarSchema,
            input[property],
        );
    };
    let path = compiled.path;
    for (const entry of compiled.pathParameters) {
        const encoded = parameter(entry.property);
        if (encoded === undefined) {
            throw new Error("A required path parameter is missing");
        }
        path = path.replace(`{${entry.wireName}}`, encoded);
    }
    const url = new URL(`/.cms/call/${target.release.contractId}${path}`, origin);
    const query: string[] = [];
    for (const entry of compiled.query) {
        const encoded = parameter(entry.property);
        if (encoded !== undefined) {
            query.push(`${encodeURIComponent(entry.wireName)}=${encoded}`);
        }
    }
    url.search = query.join("&");
    const headers = new Headers({ origin, "x-request-id": traceId });
    if (credentials.cookie) {
        headers.set("cookie", credentials.cookie);
    }
    if (credentials.token) {
        headers.set("authorization", `Bearer ${credentials.token}`);
    }
    for (const entry of compiled.headers) {
        const encoded = parameter(entry.property, entry.encoding);
        if (encoded !== undefined) {
            headers.set(entry.wireName, encoded);
        }
    }
    const key = requestKey(target, idempotencyKey);
    if (key) {
        headers.set("idempotency-key", key);
    }
    let body: BodyInit | undefined;
    let requestBytes = 0;
    if (compiled.body?.kind === "json") {
        const value = Object.fromEntries(
            compiled.body.properties
                .filter((property) => input[property] !== undefined)
                .map((property) => [property, input[property]]),
        );
        body = JSON.stringify(value);
        requestBytes = Buffer.byteLength(body);
        headers.set("content-type", "application/json");
    } else if (compiled.body?.kind === "binary") {
        const bytes = input[compiled.body.property];
        if (!(bytes instanceof Uint8Array)) {
            throw new Error("Binary performance requests require explicit fixture bytes");
        }
        body = Uint8Array.from(bytes);
        requestBytes = bytes.byteLength;
        headers.set("content-type", compiled.body.contentTypes[0] ?? "application/octet-stream");
    }
    return {
        url,
        init: {
            method: compiled.method,
            headers,
            ...(body === undefined ? {} : { body }),
            redirect: "manual" as const,
        },
        traceId,
        requestBytes,
        compiled,
    };
}

export async function responseBytes(response: Response, maximum = 4 * 1024 * 1024): Promise<Uint8Array> {
    if (!response.body) {
        return new Uint8Array();
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        for (;;) {
            const part = await reader.read();
            if (part.done) {
                const result = new Uint8Array(size);
                let offset = 0;
                for (const chunk of chunks) {
                    result.set(chunk, offset);
                    offset += chunk.byteLength;
                }
                return result;
            }
            size += part.value.byteLength;
            if (size > maximum) {
                throw new Error("Performance response exceeds its byte budget");
            }
            chunks.push(part.value);
        }
    } finally {
        await reader.cancel();
        reader.releaseLock();
    }
}
