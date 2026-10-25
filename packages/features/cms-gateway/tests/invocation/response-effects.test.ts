import { describe, expect, test } from "bun:test";
import type { CapabilityDefinition } from "@bernouy/cms-repository/contracts";
import type { CompiledHttpBinding } from "@bernouy/cms-repository/contracts/bindings";
import { validateHttpResponse as validateResponse } from "cms-gateway/invocation/http/response/validate";

const capability = {
    id: "login-password",
    access: "public",
    behavior: { effect: "command", idempotency: "none", execution: "sync" },
    input: { type: "object", properties: {}, required: [] },
    output: {
        type: "object",
        properties: { subjectId: { type: "string", maxLength: 200 } },
        required: ["subjectId"],
    },
    errors: [{ code: "INVALID_CREDENTIALS", retryable: false }],
    responseEffects: ["session"],
} as CapabilityDefinition;

const binding = {
    response: {
        kind: "json",
        successStatuses: [200],
        contentTypes: ["application/json"],
        errorStatuses: { INVALID_CREDENTIALS: 401 },
        errorEnvelope: { kind: "json" },
    },
} as CompiledHttpBinding;

describe("gateway response effects", () => {
    test("preserves a declared session effect on a successful response", () => {
        const responseEffect = {
            type: "session" as const,
            operation: "establish" as const,
            token: "opaque-session",
            expiresAt: "2030-01-01T00:00:00.000Z",
        };
        expect(
            validateResponse(
                capability,
                binding,
                { status: 200, contentType: "application/json", output: { subjectId: "subject-a" }, responseEffect },
                "request-1",
            ),
        ).toMatchObject({ kind: "success", responseEffect });
    });

    test("rejects undeclared effects and effects attached to errors", () => {
        const responseEffect = { type: "session" as const, operation: "clear" as const };
        expect(() =>
            validateResponse(
                { ...capability, responseEffects: undefined },
                binding,
                { status: 200, contentType: "application/json", output: { subjectId: "subject-a" }, responseEffect },
                "request-1",
            ),
        ).toThrow("undeclared response effect");
        expect(() =>
            validateResponse(
                capability,
                binding,
                { status: 401, contentType: "application/json", errorCode: "INVALID_CREDENTIALS", responseEffect },
                "request-1",
            ),
        ).toThrow("provider errors cannot request response effects");
    });
});
