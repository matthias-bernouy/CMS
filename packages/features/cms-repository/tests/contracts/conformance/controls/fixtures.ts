import type { CapabilityDefinition, ConformanceCall } from "@bernouy/cms-repository/contracts";
import { DEFAULT_RELEASE_LIMITS } from "@bernouy/cms-repository/contracts";
import type { ReleaseLimits } from "cms-repository/contracts/core/protocol/limits";
import { parseConformanceControls } from "cms-repository/contracts/core/conformance/calls/controls/parseControls";
import { capability, objectSchema, stringSchema } from "../../support/fixtures";

export function target(overrides: Record<string, unknown> = {}): CapabilityDefinition {
    return capability({ input: objectSchema({}), ...overrides });
}

export function controls(
    changes: Record<string, unknown> = {},
    capability = target(),
    limits: Readonly<ReleaseLimits> = DEFAULT_RELEASE_LIMITS,
) {
    return parseConformanceControls(
        { input: {}, expect: { kind: "success" }, ...changes },
        capability,
        "$.call",
        limits,
    );
}

export function query(overrides: Record<string, unknown> = {}): CapabilityDefinition {
    return target({ behavior: { effect: "query", execution: "sync" }, ...overrides });
}

export function operation(): CapabilityDefinition {
    return target({
        behavior: { effect: "command", execution: "operation", idempotency: "keyed" },
        binding: {
            transport: "http",
            method: "POST",
            path: "/jobs",
            input: { body: true },
            response: {
                successStatuses: [202],
                contentTypes: ["application/json"],
                errorStatuses: { INVALID_RECIPIENT: 422 },
            },
        },
    });
}

export const pagination = {
    itemsPath: "/items",
    cursorPath: "/next",
    cursorInput: "cursor",
    maxPages: 10,
    uniqueBy: "/id",
};

export function paginated(overrides: Record<string, unknown> = {}): CapabilityDefinition {
    return query({
        input: objectSchema({ cursor: { ...stringSchema(64), nullable: true }, filter: stringSchema() }),
        output: objectSchema(
            {
                items: { type: "array", maxItems: 10, items: objectSchema({ id: stringSchema() }, ["id"]) },
                next: { ...stringSchema(64), nullable: true },
            },
            ["items", "next"],
        ),
        ...overrides,
    });
}

export function call(id: string, change: Partial<ConformanceCall> = {}): ConformanceCall {
    return {
        id,
        capabilityId: "email.message.send",
        actor: { kind: "admin" },
        input: {},
        invocationKey: "delivery",
        expect: { kind: "success" },
        ...change,
    };
}
