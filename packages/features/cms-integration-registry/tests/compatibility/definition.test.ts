import { describe, expect, test } from "bun:test";
import { evaluator, packageState } from "./fixtures";

describe("integration definition compatibility", () => {
    test("treats a newly declared input enum as narrowing", () => {
        const baseline = packageState("1.0.0", {
            inputs: [{ name: "mode", label: "Mode", type: "text" }],
        });
        const candidate = packageState("1.0.1", {
            inputs: [
                {
                    name: "mode",
                    label: "Mode",
                    type: "text",
                    options: [{ label: "Safe", value: "safe" }],
                },
            ],
        });

        const decision = evaluator().evaluateAdmission({ baseline, candidate });
        expect(decision).toMatchObject({ accepted: false, report: { outcome: "breaking" } });
        expect(decision.report.evidence).toContainEqual(expect.objectContaining({ code: "input-narrowed" }));
    });

    test("detects dependency range narrowing in the maintained SemVer direction", () => {
        const baseline = dependencyPackage("1.0.0", "^1.2.0");
        const narrowed = evaluator().evaluateAdmission({ baseline, candidate: dependencyPackage("1.0.1", "~1.2.0") });
        const widened = evaluator().evaluateAdmission({
            baseline,
            candidate: dependencyPackage("1.1.0", ">=1.0.0 <2.0.0"),
        });

        expect(narrowed).toMatchObject({ accepted: false, report: { outcome: "breaking" } });
        expect(narrowed.report.evidence).toContainEqual(expect.objectContaining({ code: "dependency-range-narrowed" }));
        expect(widened.accepted).toBeTrue();
        expect(widened.report.evidence).toContainEqual(expect.objectContaining({ code: "dependency-range-widened" }));
    });

    test("rejects removed or renamed artifacts", () => {
        const baseline = packageState("1.0.0", { artifacts: [sourceArtifact([sourceEndpoint()])] });
        const candidate = packageState("1.0.1", { artifacts: [sourceArtifact([sourceEndpoint()], "renamed")] });

        const decision = evaluator().evaluateAdmission({ baseline, candidate });
        expect(decision).toMatchObject({ accepted: false, report: { outcome: "breaking" } });
        expect(decision.report.evidence).toContainEqual(expect.objectContaining({ code: "artifact-removed" }));
    });

    test("compares source endpoint identities, required parameters, and access permissions", () => {
        const baseline = packageState("1.0.0", { artifacts: [sourceArtifact([sourceEndpoint()])] });
        const removed = evaluator().evaluateAdmission({
            baseline,
            candidate: packageState("1.0.1", { artifacts: [sourceArtifact([])] }),
        });
        const narrowed = evaluator().evaluateAdmission({
            baseline,
            candidate: packageState("1.0.1", {
                artifacts: [
                    sourceArtifact([
                        sourceEndpoint({
                            access: "admin",
                            params: [{ name: "account", in: "query", type: "string", required: true }],
                        }),
                    ]),
                ],
            }),
        });

        expect(removed.report.evidence).toContainEqual(expect.objectContaining({ code: "source-endpoint-removed" }));
        expect(narrowed.report.evidence.map((entry) => entry.code)).toEqual(
            expect.arrayContaining(["endpoint-access-tightened", "required-endpoint-parameter-added"]),
        );
        expect(narrowed.accepted).toBeFalse();
    });

    test("marks unstructured public endpoint contract changes unknown", () => {
        const baseline = packageState("1.0.0", { artifacts: [sourceArtifact([sourceEndpoint()])] });
        const candidate = packageState("1.0.1", {
            artifacts: [
                sourceArtifact([
                    sourceEndpoint({ headers: [{ name: "x-role", source: { from: "computed", ref: "userRole" } }] }),
                ]),
            ],
        });

        const decision = evaluator().evaluateAdmission({ baseline, candidate });
        expect(decision).toMatchObject({ accepted: false, report: { outcome: "unknown" } });
        expect(decision.report.evidence).toContainEqual(
            expect.objectContaining({ code: "endpoint-contract-unproven" }),
        );
    });

    test("ignores implementation-only workflow steps when the declared function contract is stable", () => {
        const baseline = packageState("1.0.0", {
            artifacts: [functionArtifact([{ assert: { condition: { exists: true } } }])],
        });
        const candidate = packageState("1.0.1", { artifacts: [functionArtifact([])] });

        const decision = evaluator().evaluateAdmission({ baseline, candidate });
        expect(decision.accepted).toBeTrue();
        expect(decision.report.evidence).toEqual([]);
    });
});

function dependencyPackage(version: string, versionRange: string) {
    return packageState(version, {
        dependencies: [{ name: "commerce", kind: "commerce", versionRange }],
    });
}

function sourceArtifact(endpoints: unknown[], id = "primary") {
    return { type: "source", source: { id, meta: { name: "Primary" }, endpoints } };
}

function sourceEndpoint(overrides: Record<string, unknown> = {}) {
    return {
        endpointId: "list",
        method: "GET",
        targetUrl: "https://api.example.test/items",
        params: [],
        ...overrides,
    };
}

function functionArtifact(steps: unknown[]) {
    return {
        type: "function",
        function: {
            id: "sync",
            method: "POST",
            input: { body: { type: "object" } },
            output: [{ status: "200", body: { type: "object" } }],
            steps,
            return: { status: 200, body: {} },
        },
    };
}
