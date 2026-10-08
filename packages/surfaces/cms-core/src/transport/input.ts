import { decodeHttpParameter } from "@bernouy/cms-repository/contracts/bindings";
import {
    MAX_CAPABILITY_JSON_BYTES,
    MAX_CAPABILITY_JSON_DEPTH,
    parseStrictJson,
} from "@bernouy/cms-repository/contracts/protocol";
import type { UlviaScalarSchema } from "@bernouy/cms-repository/contracts/schema";
import type { CapabilityDefinition } from "@bernouy/cms-repository/contracts";
import { readBoundedRequestBody } from "@bernouy/http-runner";
import type { CoreCapabilityInvocationContext } from "../dispatch/registry";

export async function decodeCoreContractInput(
    request: Request,
    url: URL,
    capability: CapabilityDefinition,
    pathParameters: Readonly<Record<string, string>>,
): Promise<{
    input: Readonly<Record<string, unknown>>;
    binaryBody?: CoreCapabilityInvocationContext["binaryBody"];
}> {
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
            if (!request.body) {
                throw new TypeError("Binary CMS Core contract body is required.");
            }
            const lengthHeader = request.headers.get("content-length");
            const contentLength = lengthHeader === null ? undefined : Number(lengthHeader);
            if (contentLength !== undefined && (!Number.isSafeInteger(contentLength) || contentLength < 0)) {
                throw new TypeError("Binary CMS Core content length is invalid.");
            }
            return {
                input,
                binaryBody: {
                    stream: request.body,
                    ...(request.headers.get("content-type")
                        ? { contentType: request.headers.get("content-type")! }
                        : {}),
                    ...(contentLength === undefined ? {} : { contentLength }),
                },
            };
        }
        const body = await readJsonObject(request);
        const properties = binding.body === true ? Object.keys(body) : binding.body.properties;
        for (const property of properties) {
            if (Object.hasOwn(body, property)) {
                if (Object.hasOwn(input, property)) {
                    throw new TypeError(`CMS Core input property is bound more than once: ${property}.`);
                }
                input[property] = body[property];
            }
        }
    }
    return { input };
}

function decodeScalar(capability: CapabilityDefinition, property: string, raw: string | undefined): unknown {
    if (raw === undefined) {
        throw new TypeError(`Missing path parameter ${property}.`);
    }
    return decodeHttpParameter(capability.input.properties[property] as UlviaScalarSchema, raw);
}

async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
    if (request.headers.get("content-type")?.split(";", 1)[0]?.trim() !== "application/json") {
        throw new TypeError("CMS Core contract bodies must use application/json.");
    }
    const bytes = await readBoundedRequestBody(request, MAX_CAPABILITY_JSON_BYTES);
    const value = parseStrictJson(bytes, MAX_CAPABILITY_JSON_BYTES, MAX_CAPABILITY_JSON_DEPTH);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new TypeError("CMS Core contract body must be an object.");
    }
    return value as Record<string, unknown>;
}
