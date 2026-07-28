import { describe, expect, test } from "bun:test";
import { parseIntegrationDefinition } from "@bernouy/cms-integrations";

describe("@bernouy/cms-integrations connector function compatibility contract", () => {
    test("keeps legacy function declarations parseable", () => {
        const definition = parseDefinition({ name: "hook", directory: "functions/hook" });

        expect(definition.connectors?.[0]?.functions?.[0]).toEqual({
            name: "hook",
            directory: "functions/hook",
        });
    });

    test("normalizes routes, methods, sets, responses, and response shapes", () => {
        const definition = parseDefinition({
            name: "hook",
            directory: "functions/hook",
            compatibility: {
                http: {
                    requiredSecrets: ["WEBHOOK_SECRET", "API_KEY"],
                    endpoints: [
                        {
                            route: "/events/{id}",
                            method: "post",
                            requiredInputs: ["payload", "account"],
                            requiredHeaders: ["X-Signature", "Content-Type"],
                            responses: [
                                {
                                    status: "400",
                                    body: {
                                        type: "object",
                                        required: ["message"],
                                        properties: {
                                            message: { type: "string", minLength: 1 },
                                            code: { type: "string", enum: ["missing", "invalid"] },
                                        },
                                    },
                                },
                                { status: "204" },
                            ],
                        },
                    ],
                },
            },
        });

        expect(definition.connectors?.[0]?.functions?.[0]?.compatibility?.http).toEqual({
            endpoints: [
                {
                    route: "/events/{id}",
                    method: "POST",
                    requiredInputs: ["account", "payload"],
                    requiredHeaders: ["content-type", "x-signature"],
                    responses: [
                        { status: "204" },
                        {
                            status: "400",
                            body: {
                                type: "object",
                                properties: {
                                    code: { type: "string", enum: ["invalid", "missing"] },
                                    message: { type: "string", minLength: 1 },
                                },
                                required: ["message"],
                            },
                        },
                    ],
                },
            ],
            requiredSecrets: ["API_KEY", "WEBHOOK_SECRET"],
        });
    });

    test.each([
        ["duplicate endpoint", http({ endpoints: [endpoint(), endpoint()] }), /duplicate method and route/],
        [
            "duplicate status",
            http({ endpoints: [endpoint({ responses: [{ status: "200" }, { status: "200" }] })] }),
            /duplicate status/,
        ],
        ["invalid method", http({ endpoints: [endpoint({ method: "CONNECT" })] }), /must be one of/],
        ["invalid route", http({ endpoints: [endpoint({ route: "events" })] }), /absolute route path/],
        ["invalid status", http({ endpoints: [endpoint({ responses: [{ status: "700" }] })] }), /HTTP status/],
        [
            "duplicate required input",
            http({ endpoints: [endpoint({ requiredInputs: ["id", "id"] })] }),
            /duplicate input/,
        ],
        [
            "case-insensitive duplicate header",
            http({ endpoints: [endpoint({ requiredHeaders: ["X-Signature", "x-signature"] })] }),
            /duplicate header/,
        ],
        [
            "invalid header syntax",
            http({ endpoints: [endpoint({ requiredHeaders: ["x signature"] })] }),
            /valid HTTP field name/,
        ],
        [
            "unknown compatibility field",
            { http: { endpoints: [], requiredSecrets: [] }, route: "/" },
            /route.*not supported/,
        ],
    ])("rejects %s", (_label, compatibility, expected) => {
        expect(() => parseDefinition({ name: "hook", directory: "functions/hook", compatibility })).toThrow(
            expected as RegExp,
        );
    });
});

function parseDefinition(functionTemplate: Record<string, unknown>) {
    return parseIntegrationDefinition({
        kind: "webhooks",
        label: "Webhooks",
        inputs: [],
        connectors: [{ provider: "supabase", functions: [functionTemplate] }],
    });
}

function http(overrides: Record<string, unknown>) {
    return { http: { endpoints: [], requiredSecrets: [], ...overrides } };
}

function endpoint(overrides: Record<string, unknown> = {}) {
    return {
        route: "/events",
        method: "POST",
        requiredInputs: [],
        requiredHeaders: [],
        responses: [{ status: "200" }],
        ...overrides,
    };
}
