import { decodeHttpParameter } from "@bernouy/cms-repository/contracts/bindings";
import { parseStrictJson } from "@bernouy/cms-repository/contracts/protocol";
import { validateSchemaValue } from "@bernouy/cms-repository/contracts/schema";
import type { CapabilityDefinition } from "@bernouy/cms-repository/contracts";
import { OfficialCoreCapabilityError, type OfficialCoreCapabilities } from "../core/coreCapabilities";

export interface OfficialPageCapabilities {
    readonly list: CapabilityDefinition;
    readonly get: CapabilityDefinition;
    readonly create: CapabilityDefinition;
    readonly update: CapabilityDefinition;
    readonly publish: CapabilityDefinition;
    readonly delete: CapabilityDefinition;
    readonly rename: CapabilityDefinition;
}

export async function handleOfficialPages(
    request: Request,
    capabilities: OfficialPageCapabilities,
    core: OfficialCoreCapabilities,
): Promise<Response | null> {
    const url = new URL(request.url);
    if (url.pathname !== "/v1/cms/pages" && !url.pathname.startsWith("/v1/cms/pages/")) {
        return null;
    }
    const selected = selectCapability(request.method, url.pathname, capabilities);
    if (!selected) {
        return new Response(null, { status: 404 });
    }
    let input: Readonly<Record<string, unknown>>;
    try {
        input = await capabilityInput(request, url, selected.capability, selected.id);
        validateSchemaValue(selected.capability.input, input);
    } catch {
        return new Response(null, { status: 400 });
    }
    try {
        const output = await core.invoke("ulvia.cms.pages", selected.id, input);
        validateSchemaValue(selected.capability.output, output);
        return Response.json(output, {
            status: selected.id === "create" ? 201 : 200,
            headers: { "Cache-Control": "no-store" },
        });
    } catch (cause) {
        if (
            cause instanceof OfficialCoreCapabilityError &&
            selected.capability.binding.response.errorStatuses[cause.code] === cause.status
        ) {
            return Response.json({ error: { code: cause.code } }, { status: cause.status });
        }
        return Response.json({ error: { code: "CORE_UNAVAILABLE" } }, { status: 503 });
    }
}

function selectCapability(method: string, path: string, capabilities: OfficialPageCapabilities) {
    if (path === "/v1/cms/pages") {
        return method === "GET"
            ? { id: "list" as const, capability: capabilities.list }
            : method === "POST"
              ? { id: "create" as const, capability: capabilities.create }
              : null;
    }
    if (method === "POST" && path.endsWith("/publication")) {
        return { id: "publish" as const, capability: capabilities.publish };
    }
    const selected = {
        GET: { id: "get" as const, capability: capabilities.get },
        PUT: { id: "update" as const, capability: capabilities.update },
        PATCH: { id: "rename" as const, capability: capabilities.rename },
        DELETE: { id: "delete" as const, capability: capabilities.delete },
    }[method];
    return selected ?? null;
}

async function capabilityInput(
    request: Request,
    url: URL,
    capability: CapabilityDefinition,
    capabilityId: string,
): Promise<Readonly<Record<string, unknown>>> {
    const input: Record<string, unknown> = {};
    for (const [name, schema] of Object.entries(capability.input.properties)) {
        const raw = url.searchParams.get(name);
        if (raw !== null) {
            input[name] = decodeHttpParameter(schema as never, raw);
        }
    }
    if (!["list", "create"].includes(capabilityId)) {
        const suffix = url.pathname.slice("/v1/cms/pages/".length).replace(/\/publication$/u, "");
        input.id = decodeHttpParameter(capability.input.properties.id as never, suffix);
    }
    if (!["list", "get", "delete"].includes(capabilityId)) {
        const bytes = await readBody(request, 1024 * 1024 + 16 * 1024);
        const body = parseStrictJson(bytes, bytes.byteLength, 32);
        if (!body || typeof body !== "object" || Array.isArray(body)) {
            throw new TypeError("Page capability body must be an object.");
        }
        Object.assign(input, body);
    }
    return input;
}

async function readBody(request: Request, limit: number): Promise<Uint8Array> {
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.byteLength > limit) {
        throw new TypeError("Page capability body is too large.");
    }
    return bytes;
}
