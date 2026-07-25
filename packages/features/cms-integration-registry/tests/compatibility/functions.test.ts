import { describe, expect, test } from "bun:test";
import { connector, evaluator, functionTemplate, httpEndpoint, packageState } from "./fixtures";

describe("integration connector function compatibility", () => {
    test("keeps source-only changes patch-eligible when the HTTP declaration is unchanged", () => {
        const decision = evaluator().evaluateAdmission({
            baseline: functionPackage("1.0.0", functionTemplate()),
            candidate: functionPackage("1.0.1", functionTemplate()),
            changedPaths: ["connectors/supabase/functions/webhook/index.ts"],
        });

        expect(decision.accepted).toBeTrue();
        expect(decision.report.evidence).toContainEqual(
            expect.objectContaining({ classification: "compatible", code: "function-implementation-changed" }),
        );
    });

    test("fails closed when changed function source has no comparable declaration", () => {
        const legacy = { name: "webhook", directory: "functions/webhook" };
        const decision = evaluator().evaluateAdmission({
            baseline: functionPackage("1.0.0", legacy),
            candidate: functionPackage("1.0.1", legacy),
            changedPaths: ["connectors/supabase/functions/webhook/index.ts"],
        });

        expect(decision).toMatchObject({ accepted: false, status: 422, report: { outcome: "unknown" } });
        expect(decision.report.evidence).toContainEqual(
            expect.objectContaining({ code: "function-contract-unproven" }),
        );
    });

    test("detects unrepresented deployment metadata changes without relying on file paths", () => {
        const decision = evaluator().evaluateAdmission({
            baseline: functionPackage("1.0.0", {
                name: "webhook",
                directory: "functions/webhook",
                secrets: { API_KEY: "{{inputs.key}}" },
            }),
            candidate: functionPackage("1.0.1", {
                name: "webhook",
                directory: "functions/webhook-v2",
                secrets: { API_KEY: "{{generated.key}}" },
            }),
        });

        expect(decision).toMatchObject({ accepted: false, report: { outcome: "unknown" } });
    });

    test("does not invent an implicit config path for legacy functions", () => {
        const legacy = { name: "webhook", directory: "functions/webhook" };
        const decision = evaluator().evaluateAdmission({
            baseline: functionPackage("1.0.0", legacy),
            candidate: functionPackage("1.0.1", legacy),
            changedPaths: ["connectors/supabase/supabase.config.toml"],
        });

        expect(decision.accepted).toBeTrue();
        expect(decision.report.evidence).toEqual([]);
    });

    test.each([
        ["required input", { requiredInputs: ["account"] }, "required-input-added"],
        ["required header", { requiredHeaders: ["x-signature"] }, "required-header-added"],
    ])("rejects a new %s", (_label, endpointOverrides, code) => {
        const decision = evaluator().evaluateAdmission({
            baseline: functionPackage("1.0.0", functionTemplate()),
            candidate: functionPackage("1.0.1", declaredFunction(endpointOverrides)),
        });

        expect(decision).toMatchObject({ accepted: false, status: 422, report: { outcome: "breaking" } });
        expect(decision.report.evidence).toContainEqual(expect.objectContaining({ code }));
    });

    test("rejects a new required secret and removed endpoint", () => {
        const requiredSecret = evaluator().evaluateAdmission({
            baseline: functionPackage("1.0.0", functionTemplate()),
            candidate: functionPackage("1.0.1", declaredFunction({}, ["WEBHOOK_SECRET"])),
        });
        const endpointRemoved = evaluator().evaluateAdmission({
            baseline: functionPackage("1.0.0", functionTemplate()),
            candidate: functionPackage("1.0.1", declaredFunction({}, [], [])),
        });

        expect(requiredSecret.report.evidence).toContainEqual(
            expect.objectContaining({ code: "required-secret-added" }),
        );
        expect(endpointRemoved.report.evidence).toContainEqual(expect.objectContaining({ code: "endpoint-removed" }));
    });

    test("requires a minor release for an added HTTP endpoint", () => {
        const endpoints = [httpEndpoint(), httpEndpoint({ route: "/health", method: "GET" })];
        const baseline = functionPackage("1.0.0", functionTemplate());
        const patch = evaluator().evaluateAdmission({
            baseline,
            candidate: functionPackage("1.0.1", declaredFunction({}, [], endpoints)),
        });
        const minor = evaluator().evaluateAdmission({
            baseline,
            candidate: functionPackage("1.1.0", declaredFunction({}, [], endpoints)),
        });

        expect(patch).toMatchObject({ accepted: false, status: 422, report: { requiredReleaseLevel: "minor" } });
        expect(minor.accepted).toBeTrue();
        expect(minor.report.evidence).toContainEqual(expect.objectContaining({ code: "endpoint-added" }));
    });

    test("uses output covariance for nullability, required properties, added fields, and array items", () => {
        const weak = responseContract(false);
        const strong = responseContract(true);
        const strengthened = evaluator().evaluateAdmission({
            baseline: functionPackage("1.0.0", weak),
            candidate: functionPackage("1.1.0", strong),
        });
        const weakened = evaluator().evaluateAdmission({
            baseline: functionPackage("1.0.0", strong),
            candidate: functionPackage("1.0.1", weak),
        });

        expect(strengthened.accepted).toBeTrue();
        expect(strengthened.report.evidence.map((entry) => entry.code)).toEqual(
            expect.arrayContaining([
                "response-nullability-strengthened",
                "response-property-guaranteed",
                "response-property-added",
                "response-items-declared",
            ]),
        );
        expect(weakened).toMatchObject({ accepted: false, report: { outcome: "breaking" } });
        expect(weakened.report.evidence.map((entry) => entry.code)).toEqual(
            expect.arrayContaining([
                "response-nullability-weakened",
                "response-property-optional",
                "response-property-removed",
                "response-items-removed",
            ]),
        );
    });
});

function functionPackage(version: string, fn: Record<string, unknown>) {
    return packageState(version, { connectors: [connector({ functions: [fn] })] });
}

function declaredFunction(endpointOverrides: Record<string, unknown>, secrets: string[] = [], endpoints?: unknown[]) {
    return functionTemplate({
        compatibility: {
            http: {
                requiredSecrets: secrets,
                endpoints: endpoints ?? [httpEndpoint(endpointOverrides)],
            },
        },
    });
}

function responseContract(strong: boolean) {
    const properties: Record<string, unknown> = {
        id: { type: "string", nullable: !strong },
        guaranteed: { type: "string" },
        values: strong ? { type: "array", items: { type: "string" } } : { type: "array" },
    };
    if (strong) {
        properties.added = { type: "number" };
    }
    return declaredFunction({
        responses: [
            {
                status: "200",
                body: {
                    type: "object",
                    properties,
                    ...(strong ? { required: ["guaranteed", "added"] } : {}),
                },
            },
        ],
    });
}
