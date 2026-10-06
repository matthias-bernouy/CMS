import { decodeHttpParameter } from "@bernouy/cms-repository/contracts/bindings";
import {
    MAX_CAPABILITY_JSON_BYTES,
    MAX_CAPABILITY_JSON_DEPTH,
    parseStrictJson,
} from "@bernouy/cms-repository/contracts/protocol";
import type { UlviaScalarSchema } from "@bernouy/cms-repository/contracts/schema";
import type { CapabilityDefinition } from "@bernouy/cms-repository/contracts";

export async function decodeCoreContractInput(
    request: Request,
    url: URL,
    capability: CapabilityDefinition,
    pathParameters: Readonly<Record<string, string>>,
): Promise<Readonly<Record<string, unknown>>> {
    const input: Record<string, unknown> = {};
    const binding = capability.binding.input;
    for (const [property, wireName] of Object.entries(binding?.path ?? {})) {
        input[property] = decodeScalar(capability, property, pathParameters[wireName]);
    }
    for (const [property, wireName] of Object.entries(binding?.query ?? {})) {
        const raw = url.searchParams.get(wireName);
        if (raw !== null) {
            input[property] = decodeScalar(capability, property, encodeURIComponent(raw));
        }
    }
    for (const [property, wireName] of Object.entries(binding?.headers ?? {})) {
        const raw = request.headers.get(wireName);
        if (raw !== null) {
            input[property] = decodeScalar(capability, property, raw);
        }
    }
    if (binding?.body) {
        if (typeof binding.body === "object" && "binaryProperty" in binding.body) {
            throw new TypeError("Binary Core contract relays are not supported.");
        }
        const body = await readJsonObject(request);
        copyBodyProperties(input, body, binding.body === true ? Object.keys(body) : binding.body.properties);
    }
    return input;
}

function copyBodyProperties(
    input: Record<string, unknown>,
    body: Readonly<Record<string, unknown>>,
    properties: readonly string[],
): void {
    for (const property of properties) {
        if (!Object.hasOwn(body, property)) {
            continue;
        }
        if (Object.hasOwn(input, property)) {
            throw new TypeError(`Core contract input property is bound more than once: ${property}.`);
        }
        input[property] = body[property];
    }
}

function decodeScalar(capability: CapabilityDefinition, property: string, raw: string | undefined): unknown {
    if (raw === undefined) {
        throw new TypeError(`Missing path parameter ${property}.`);
    }
    return decodeHttpParameter(capability.input.properties[property] as UlviaScalarSchema, raw);
}

async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
    if (request.headers.get("content-type")?.split(";", 1)[0]?.trim() !== "application/json") {
        throw new TypeError("Core contract bodies must use application/json.");
    }
    const reader = request.body?.getReader();
    if (!reader) {
        throw new TypeError("Core contract body is required.");
    }
    const parts: Uint8Array[] = [];
    let length = 0;
    for (;;) {
        const next = await reader.read();
        if (next.done) {
            break;
        }
        length += next.value.byteLength;
        if (length > MAX_CAPABILITY_JSON_BYTES) {
            await reader.cancel().catch(() => undefined);
            throw new TypeError("Core contract body is too large.");
        }
        parts.push(next.value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) {
        bytes.set(part, offset);
        offset += part.byteLength;
    }
    const value = parseStrictJson(bytes, MAX_CAPABILITY_JSON_BYTES, MAX_CAPABILITY_JSON_DEPTH);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new TypeError("Core contract body must be an object.");
    }
    return value as Record<string, unknown>;
}
