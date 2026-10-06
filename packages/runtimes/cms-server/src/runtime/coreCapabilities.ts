import { timingSafeEqual } from "node:crypto";
import { CoreCapabilityDispatchError, type CoreCapabilityDispatcher } from "@bernouy/cms-content";
import type { Runner } from "@bernouy/http-runner";
import { readBoundedRequestBody, RequestBodyTooLargeError } from "@bernouy/http-runner";
import {
    MAX_CAPABILITY_JSON_BYTES,
    MAX_CAPABILITY_JSON_DEPTH,
    parseStrictJson,
} from "@bernouy/cms-repository/contracts/protocol";

export const LOCAL_CORE_CAPABILITY_ROUTE = "/.cms/internal/core-call";
export function mountLocalCoreCapabilities(runner: Runner, dispatcher: CoreCapabilityDispatcher, token: string): void {
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
            const bytes = await readBoundedRequestBody(request, MAX_CAPABILITY_JSON_BYTES);
            const call = parseCall(parseStrictJson(bytes, MAX_CAPABILITY_JSON_BYTES, MAX_CAPABILITY_JSON_DEPTH));
            return noStoreJson(await dispatcher.invoke(call.contractId, call.capabilityId, call.input, call.context));
        } catch (error) {
            if (error instanceof CoreCapabilityDispatchError) {
                return coreError(error.code, error.status);
            }
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
    context: Parameters<CoreCapabilityDispatcher["invoke"]>[3];
};

function parseCall(value: unknown): CoreCapabilityCall {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new TypeError("Invalid Core capability call.");
    }
    const call = value as Record<string, unknown>;
    if (
        Object.keys(call).some((key) => !["contractId", "capabilityId", "context", "input"].includes(key)) ||
        typeof call.contractId !== "string" ||
        typeof call.capabilityId !== "string" ||
        !call.input ||
        typeof call.input !== "object" ||
        Array.isArray(call.input) ||
        !validContext(call.context)
    ) {
        throw new TypeError("Invalid Core capability call.");
    }
    return call as CoreCapabilityCall;
}

function validContext(value: unknown): boolean {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }
    const context = value as Record<string, unknown>;
    const allowed = [
        "requestId",
        "siteId",
        "installationId",
        "origin",
        "actorKind",
        "providerSubjectId",
        "idempotencyKey",
    ];
    return (
        Object.keys(context).every((key) => allowed.includes(key)) &&
        typeof context.requestId === "string" &&
        /^[0-9a-f-]{36}$/u.test(context.requestId) &&
        typeof context.siteId === "string" &&
        typeof context.installationId === "string" &&
        ["delivery", "page", "control", "provider", "system", "conformance"].includes(String(context.origin)) &&
        ["anonymous", "user", "administrator", "provider", "system"].includes(String(context.actorKind)) &&
        (context.providerSubjectId === undefined || typeof context.providerSubjectId === "string") &&
        (context.idempotencyKey === undefined || typeof context.idempotencyKey === "string")
    );
}

function authorized(header: string | null, expected: string): boolean {
    if (!header?.startsWith("Bearer ")) {
        return false;
    }
    const received = Buffer.from(header.slice(7));
    const secret = Buffer.from(expected);
    return received.length === secret.length && timingSafeEqual(received, secret);
}
