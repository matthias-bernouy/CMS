import { timingSafeEqual } from "node:crypto";
import {
    CmsPageNotFoundError,
    ContentValidationError,
    listCmsPages,
    PageRevisionConflictError,
    renameCmsPage,
    type CmsRepository,
} from "@bernouy/cms-content";
import type { Runner } from "@bernouy/http-runner";
import { readBoundedRequestBody, RequestBodyTooLargeError } from "@bernouy/http-runner";
import { parseStrictJson } from "@bernouy/cms-repository/contracts/protocol";

export const LOCAL_CORE_CAPABILITY_ROUTE = "/.cms/internal/core-call";
const MAX_INPUT_BYTES = 8 * 1024;

export function mountLocalCoreCapabilities(runner: Runner, repository: CmsRepository, token: string): void {
    if (token.length < 24 || token.length > 256) {
        throw new Error("CMS_LOCAL_PROVIDER_TOKEN must contain between 24 and 256 characters.");
    }
    runner.post(LOCAL_CORE_CAPABILITY_ROUTE, async (request) => {
        if (!authorized(request.headers.get("authorization"), token)) {
            return new Response(null, { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
        }
        if (request.headers.get("content-type")?.split(";", 1)[0]?.trim() !== "application/json") {
            return new Response(null, { status: 415 });
        }
        try {
            const bytes = await readBoundedRequestBody(request, MAX_INPUT_BYTES);
            const call = parseCall(parseStrictJson(bytes, MAX_INPUT_BYTES, 8));
            if (call.contractId !== "ulvia.cms.pages") {
                return new Response(null, { status: 404 });
            }
            if (call.capabilityId === "list") {
                return noStoreJson(await listCmsPages(repository, call.input));
            }
            if (call.capabilityId === "rename") {
                try {
                    return noStoreJson(
                        await renameCmsPage(repository, call.input as unknown as Parameters<typeof renameCmsPage>[1]),
                    );
                } catch (error) {
                    if (error instanceof CmsPageNotFoundError) {
                        return coreError("NOT_FOUND", 404);
                    }
                    if (error instanceof PageRevisionConflictError) {
                        return coreError("REVISION_CONFLICT", 409);
                    }
                    if (error instanceof ContentValidationError) {
                        return coreError("INVALID_TITLE", 422);
                    }
                    throw error;
                }
            }
            return new Response(null, { status: 404 });
        } catch (error) {
            const status = error instanceof RequestBodyTooLargeError ? 413 : 400;
            return new Response(null, { status, headers: { "Cache-Control": "no-store" } });
        }
    });
}

function noStoreJson(value: unknown): Response {
    return Response.json(value, { headers: { "Cache-Control": "no-store" } });
}

function coreError(code: string, status: number): Response {
    return Response.json({ error: { code } }, { status, headers: { "Cache-Control": "no-store" } });
}

type CoreCapabilityCall = {
    contractId: string;
    capabilityId: string;
    input: Readonly<Record<string, unknown>>;
};

function parseCall(value: unknown): CoreCapabilityCall {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new TypeError("Invalid Core capability call.");
    }
    const call = value as Record<string, unknown>;
    if (
        Object.keys(call).some((key) => !["contractId", "capabilityId", "input"].includes(key)) ||
        typeof call.contractId !== "string" ||
        typeof call.capabilityId !== "string" ||
        !call.input ||
        typeof call.input !== "object" ||
        Array.isArray(call.input)
    ) {
        throw new TypeError("Invalid Core capability call.");
    }
    return call as CoreCapabilityCall;
}

function authorized(header: string | null, expected: string): boolean {
    if (!header?.startsWith("Bearer ")) {
        return false;
    }
    const received = Buffer.from(header.slice(7));
    const secret = Buffer.from(expected);
    return received.length === secret.length && timingSafeEqual(received, secret);
}
