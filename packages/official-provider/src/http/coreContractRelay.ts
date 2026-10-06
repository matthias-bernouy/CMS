import { decodeHttpParameter, pathTemplatesOverlap } from "@bernouy/cms-repository/contracts/bindings";
import {
    MAX_CAPABILITY_JSON_BYTES,
    MAX_CAPABILITY_JSON_DEPTH,
    parseStrictJson,
} from "@bernouy/cms-repository/contracts/protocol";
import { validateSchemaValue, type UlviaScalarSchema } from "@bernouy/cms-repository/contracts/schema";
import type { CapabilityDefinition, ContractRelease } from "@bernouy/cms-repository/contracts";
import { OfficialCoreCapabilityError, type OfficialCoreCapabilities } from "../core/coreCapabilities";

type CoreRoute = {
    readonly contractId: string;
    readonly capability: CapabilityDefinition;
    readonly match: (method: string, path: string) => Readonly<Record<string, string>> | null;
};

/** Relays any declared Core contract HTTP binding without contract-specific routing code. */
export function createCoreContractRelay(
    releases: readonly ContractRelease[],
    core: OfficialCoreCapabilities,
): (request: Request) => Promise<Response | null> {
    const routes = releases.flatMap((release) =>
        release.capabilities.map((capability) => compileRoute(release.contractId, capability)),
    );
    assertRoutesDoNotOverlap(routes);
    return async (request) => {
        const url = new URL(request.url);
        const selected = routes
            .map((route) => ({ route, parameters: route.match(request.method, url.pathname) }))
            .find(({ parameters }) => parameters !== null);
        if (!selected?.parameters) {
            return null;
        }
        const { contractId, capability } = selected.route;
        let input: Readonly<Record<string, unknown>>;
        try {
            input = await decodeInput(request, url, capability, selected.parameters);
            validateSchemaValue(capability.input, input);
        } catch {
            return new Response(null, { status: 400, headers: { "Cache-Control": "no-store" } });
        }
        try {
            const output = await core.invoke(contractId, capability.id, input);
            validateSchemaValue(capability.output, output);
            return successResponse(request.method, capability, output);
        } catch (cause) {
            if (cause instanceof OfficialCoreCapabilityError) {
                const status = capability.binding.response.errorStatuses[cause.code];
                if (status === cause.status) {
                    return Response.json(
                        { error: { code: cause.code } },
                        { status, headers: { "Cache-Control": "no-store" } },
                    );
                }
                return Response.json({ error: { code: "CORE_UNAVAILABLE" } }, { status: 503 });
            }
            return Response.json({ error: { code: "CORE_UNAVAILABLE" } }, { status: 503 });
        }
    };
}

function compileRoute(contractId: string, capability: CapabilityDefinition): CoreRoute {
    if (
        (typeof capability.binding.input?.body === "object" && "binaryProperty" in capability.binding.input.body) ||
        capability.binding.response.contentTypes.some((contentType) => contentType !== "application/json")
    ) {
        throw new TypeError("Core contract relays currently support JSON contracts only.");
    }
    const names: string[] = [];
    const escaped = capability.binding.path.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    const pattern = escaped.replace(/\\\{([A-Za-z][A-Za-z0-9_-]*)\\\}/gu, (_match, name: string) => {
        names.push(name);
        return "([^/]+)";
    });
    const expression = new RegExp(`^${pattern}$`, "u");
    return {
        contractId,
        capability,
        match(method, path) {
            if (method !== capability.binding.method) {
                return null;
            }
            const match = expression.exec(path);
            if (!match) {
                return null;
            }
            return Object.fromEntries(names.map((name, index) => [name, match[index + 1]!]));
        },
    };
}

function assertRoutesDoNotOverlap(routes: readonly CoreRoute[]): void {
    for (let leftIndex = 0; leftIndex < routes.length; leftIndex += 1) {
        const left = routes[leftIndex]!;
        for (let rightIndex = leftIndex + 1; rightIndex < routes.length; rightIndex += 1) {
            const right = routes[rightIndex]!;
            if (
                left.capability.binding.method === right.capability.binding.method &&
                pathTemplatesOverlap(left.capability.binding.path, right.capability.binding.path)
            ) {
                throw new TypeError(
                    `Core contract routes overlap: ${left.contractId}/${left.capability.id} and ${right.contractId}/${right.capability.id}.`,
                );
            }
        }
    }
}

function successResponse(method: string, capability: CapabilityDefinition, output: unknown): Response {
    const status = capability.binding.response.successStatuses[0]!;
    const headers = { "Cache-Control": "no-store" };
    if (method === "HEAD" || status === 204 || status === 205) {
        return new Response(null, { status, headers });
    }
    return Response.json(output, { status, headers });
}

async function decodeInput(
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
            input[property] = decodeScalar(capability, property, raw);
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
        if (binding.body === true) {
            copyBodyProperties(input, body, Object.keys(body));
        } else {
            copyBodyProperties(input, body, binding.body.properties);
        }
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
