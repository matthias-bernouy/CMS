import { timingSafeEqual } from "node:crypto";
import { decodeHttpParameter } from "@bernouy/cms-repository/contracts/bindings";
import { parseStrictJson } from "@bernouy/cms-repository/contracts/protocol";
import { validateSchemaValue } from "@bernouy/cms-repository/contracts/schema";
import type { UlviaScalarSchema } from "@bernouy/cms-repository/contracts/schema";
import type { CapabilityDefinition, ContractRelease } from "@bernouy/cms-repository/contracts";
import type { ProviderRuntimeReport } from "@bernouy/cms-repository/providers/installations";
import type { OfficialCmsInstanceDiscovery } from "../core/InstanceDiscovery";
import type { OfficialSubmissionStore } from "../core/submissions";

const ITEMS = Object.freeze([
    Object.freeze({ id: "starter", name: "Starter item" }),
    Object.freeze({ id: "editorial", name: "Editorial collection" }),
    Object.freeze({ id: "seasonal", name: "Seasonal selection" }),
]);
const MEDIA =
    '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="80" viewBox="0 0 160 80"><rect width="160" height="80" rx="12" fill="#1d4ed8"/><circle cx="42" cy="40" r="20" fill="#ffffff"/><path d="M80 40h48" stroke="#ffffff" stroke-width="10" stroke-linecap="round"/></svg>';
const MEDIA_BYTES = new TextEncoder().encode(MEDIA);

export interface OfficialProviderContracts {
    readonly catalog: ContractRelease;
    readonly forms: ContractRelease;
    readonly instances: ContractRelease;
    readonly media: ContractRelease;
}

export function createOfficialProviderHandler(options: {
    token: string;
    report: ProviderRuntimeReport;
    contracts: OfficialProviderContracts;
    instances: OfficialCmsInstanceDiscovery;
    submissions: OfficialSubmissionStore;
}): (request: Request) => Promise<Response> {
    if (!options.token.trim()) {
        throw new Error("Official provider token must not be blank");
    }
    const capabilities = resolveCapabilities(options.contracts);
    return async (request) => {
        if (!authorized(request.headers.get("authorization"), options.token)) {
            return new Response(null, { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
        }
        const path = new URL(request.url).pathname;
        if (request.method === "GET" && path === "/ulvia/report") {
            return Response.json(options.report, { headers: { "Cache-Control": "no-store" } });
        }
        if (request.method === "GET" && path === "/v1/cms-instances/current") {
            const current = await options.instances.current();
            if (!current) {
                return error("INSTANCE_UNAVAILABLE", 503);
            }
            validateSchemaValue(capabilities.instanceCurrent.output, current);
            return Response.json(current, { headers: { "Cache-Control": "no-store" } });
        }
        if (request.method === "GET" && path === "/v1/cms-instances") {
            try {
                const input = decodeQuery(new URL(request.url), capabilities.instanceList);
                const output = await options.instances.list(
                    typeof input.cursor === "string" ? input.cursor : undefined,
                    typeof input.limit === "number" ? input.limit : 25,
                );
                validateSchemaValue(capabilities.instanceList.output, output);
                return Response.json(output, { headers: { "Cache-Control": "no-store" } });
            } catch (error) {
                if (error instanceof TypeError) {
                    return new Response(null, { status: 400 });
                }
                throw error;
            }
        }
        if (request.method === "GET" && path === "/v1/catalog/items") {
            const output = { items: ITEMS };
            validateSchemaValue(capabilities.itemList.output, output);
            return Response.json(output);
        }
        if (request.method === "GET" && path.startsWith("/v1/catalog/items/")) {
            const id = pathParameter(path, "/v1/catalog/items/", 64);
            const item = ITEMS.find((candidate) => candidate.id === id);
            if (!item) {
                return error("NOT_FOUND", 404);
            }
            validateSchemaValue(capabilities.itemGet.output, item);
            return Response.json(item);
        }
        if (request.method === "POST" && path === "/v1/forms/submissions") {
            let input: unknown;
            try {
                const bytes = await readBody(request, 8192);
                input = parseStrictJson(bytes, 8192, 8);
                validateSchemaValue(capabilities.submissionCreate.input, input);
            } catch {
                return error("INVALID_SUBMISSION", 422);
            }
            const { email, message } = input as { email: string; message: string };
            const submission = await options.submissions.create({ email, message });
            const output = { id: submission.id };
            validateSchemaValue(capabilities.submissionCreate.output, output);
            return Response.json(output, { status: 201 });
        }
        if (request.method === "GET" && path.startsWith("/v1/forms/submissions/")) {
            const id = pathParameter(path, "/v1/forms/submissions/", 36);
            const submission = id ? await options.submissions.get(id) : null;
            if (!submission) {
                return error("NOT_FOUND", 404);
            }
            validateSchemaValue(capabilities.submissionGet.output, submission);
            return Response.json(submission, { headers: { "Cache-Control": "no-store" } });
        }
        if (request.method === "GET" && pathParameter(path, "/v1/media/", 64) === "starter-mark") {
            validateSchemaValue(capabilities.assetRead.output, MEDIA_BYTES);
            return new Response(MEDIA, { headers: { "Content-Type": "image/svg+xml" } });
        }
        if (request.method === "GET" && path.startsWith("/v1/media/")) {
            return error("NOT_FOUND", 404);
        }
        return new Response(null, { status: 404 });
    };
}

function resolveCapabilities(contracts: OfficialProviderContracts): {
    itemList: CapabilityDefinition;
    itemGet: CapabilityDefinition;
    submissionCreate: CapabilityDefinition;
    submissionGet: CapabilityDefinition;
    instanceList: CapabilityDefinition;
    instanceCurrent: CapabilityDefinition;
    assetRead: CapabilityDefinition;
} {
    assertContract(contracts.catalog, "catalog.items");
    assertContract(contracts.forms, "forms.submissions");
    assertContract(contracts.instances, "ulvia.provider.cms-instances");
    assertContract(contracts.media, "media.assets");
    const assetRead = requiredCapability(contracts.media, "asset.read");
    if (assetRead.media?.idInput !== "fileId") {
        throw new Error("Official media contract must expose asset.read through fileId media identity");
    }
    return {
        itemList: requiredCapability(contracts.catalog, "item.list"),
        itemGet: requiredCapability(contracts.catalog, "item.get"),
        submissionCreate: requiredCapability(contracts.forms, "submission.create"),
        submissionGet: requiredCapability(contracts.forms, "submission.get"),
        instanceList: requiredCapability(contracts.instances, "list"),
        instanceCurrent: requiredCapability(contracts.instances, "get-current"),
        assetRead,
    };
}

function decodeQuery(url: URL, capability: CapabilityDefinition): Readonly<Record<string, unknown>> {
    const input: Record<string, unknown> = {};
    for (const [name, schema] of Object.entries(capability.input.properties)) {
        const raw = url.searchParams.get(name);
        if (raw !== null) {
            input[name] = decodeHttpParameter(schema as UlviaScalarSchema, raw);
        }
    }
    validateSchemaValue(capability.input, input);
    return input;
}

function assertContract(release: ContractRelease, contractId: string): void {
    if (release.contractId !== contractId) {
        throw new Error(`Expected ${contractId}, received ${release.contractId}`);
    }
}

function requiredCapability(release: ContractRelease, capabilityId: string): CapabilityDefinition {
    const capability = release.capabilities.find((item) => item.id === capabilityId);
    if (!capability) {
        throw new Error(`${release.contractId} lacks ${capabilityId}`);
    }
    return capability;
}

function pathParameter(path: string, prefix: string, maxLength: number): string | null {
    if (!path.startsWith(prefix)) {
        return null;
    }
    try {
        const value = decodeHttpParameter({ type: "string", maxLength }, path.slice(prefix.length));
        return typeof value === "string" ? value : null;
    } catch {
        return null;
    }
}

function error(code: string, status: number): Response {
    return Response.json({ error: { code } }, { status });
}

function authorized(header: string | null, expected: string): boolean {
    if (!header?.startsWith("Bearer ")) {
        return false;
    }
    const received = Buffer.from(header.slice(7));
    const secret = Buffer.from(expected);
    return received.length === secret.length && timingSafeEqual(received, secret);
}

async function readBody(request: Request, limit: number): Promise<Uint8Array> {
    if (!request.body) {
        return new Uint8Array();
    }
    const reader = request.body.getReader();
    const parts: Uint8Array[] = [];
    let size = 0;
    try {
        for (;;) {
            const next = await reader.read();
            if (next.done) {
                break;
            }
            size += next.value.byteLength;
            if (size > limit) {
                await reader.cancel();
                throw new Error("Submission body is too large");
            }
            parts.push(next.value);
        }
    } finally {
        reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) {
        bytes.set(part, offset);
        offset += part.byteLength;
    }
    return bytes;
}
