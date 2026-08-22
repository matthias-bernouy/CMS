import { describe, expect, test } from "bun:test";
import { evaluator, packageState } from "../fixtures";

describe("source definition compatibility", () => {
    test("rejects removed or renamed artifacts", () => {
        const baseline = packageState("1.0.0", { artifacts: [sourceArtifact([sourceEndpoint()])] });
        const candidate = packageState("1.0.1", { artifacts: [sourceArtifact([sourceEndpoint()], "renamed")] });

        const decision = evaluator().evaluate({ baseline, candidate });
        expect(decision).toMatchObject({ contractAdmissible: false, outcome: "breaking" });
        expect(decision.evidence).toContainEqual(expect.objectContaining({ code: "artifact-removed" }));
    });

    test("compares endpoint identities, required parameters, and access permissions", () => {
        const baseline = packageState("1.0.0", { artifacts: [sourceArtifact([sourceEndpoint()])] });
        const removed = evaluator().evaluate({
            baseline,
            candidate: packageState("1.0.1", { artifacts: [sourceArtifact([])] }),
        });
        const narrowed = evaluator().evaluate({
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

        expect(removed.evidence).toContainEqual(expect.objectContaining({ code: "source-endpoint-removed" }));
        expect(narrowed.evidence.map((entry) => entry.code)).toEqual(
            expect.arrayContaining(["endpoint-access-tightened", "required-endpoint-parameter-added"]),
        );
        expect(narrowed.contractAdmissible).toBeFalse();
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

        const decision = evaluator().evaluate({ baseline, candidate });
        expect(decision).toMatchObject({ contractAdmissible: false, outcome: "unknown" });
        expect(decision.evidence).toContainEqual(expect.objectContaining({ code: "endpoint-contract-unproven" }));
    });

    test("tracks indexing capability changes", () => {
        const baseline = packageState("1.0.0", { artifacts: [sourceArtifact([sourceEndpoint()])] });
        const indexing = sourceIndexing({ title: { path: "title", type: "text" } });
        const added = evaluator().evaluate({
            baseline,
            candidate: packageState("1.1.0", { artifacts: [sourceArtifact([sourceEndpoint()], "primary", indexing)] }),
        });
        const removed = evaluator().evaluate({
            baseline: packageState("1.0.0", { artifacts: [sourceArtifact([sourceEndpoint()], "primary", indexing)] }),
            candidate: packageState("1.0.1", { artifacts: [sourceArtifact([sourceEndpoint()])] }),
        });

        expect(added.evidence).toContainEqual(expect.objectContaining({ code: "source-indexing-added" }));
        expect(added.contractAdmissible).toBeTrue();
        expect(removed.evidence).toContainEqual(expect.objectContaining({ code: "source-indexing-removed" }));
        expect(removed.contractAdmissible).toBeFalse();
    });

    test("classifies indexing variable additions independently from entity contract changes", () => {
        const title = { path: "title", type: "text" };
        const baseline = packageState("1.0.0", {
            artifacts: [sourceArtifact([sourceEndpoint()], "primary", sourceIndexing({ title }))],
        });
        const expanded = packageState("1.1.0", {
            artifacts: [
                sourceArtifact(
                    [sourceEndpoint()],
                    "primary",
                    sourceIndexing({ title, description: { path: "description", type: "text" } }),
                ),
            ],
        });
        const added = evaluator().evaluate({
            baseline,
            candidate: expanded,
        });
        const removed = evaluator().evaluate({
            baseline: expanded,
            candidate: packageState("1.2.0", {
                artifacts: [sourceArtifact([sourceEndpoint()], "primary", sourceIndexing({ title }))],
            }),
        });

        expect(added.evidence).toContainEqual(expect.objectContaining({ code: "indexing-variable-added" }));
        expect(added.evidence.some((entry) => entry.code === "indexing-entity-contract-changed")).toBeFalse();
        expect(added.contractAdmissible).toBeTrue();
        expect(removed.evidence).toContainEqual(expect.objectContaining({ code: "indexing-variable-removed" }));
        expect(removed.contractAdmissible).toBeFalse();
    });
});

function sourceIndexing(variables: Record<string, unknown>) {
    return {
        entities: [
            {
                id: "item",
                resolve: {
                    endpointId: "list",
                    identity: { key: "id", inputParam: "id", outputPath: "id" },
                },
                discover: { endpointId: "list", itemsPath: "items", identityPath: "id" },
                variables,
            },
        ],
    };
}

function sourceArtifact(endpoints: unknown[], id = "primary", indexing?: unknown) {
    return { type: "source", source: { id, meta: { name: "Primary" }, endpoints, ...(indexing ? { indexing } : {}) } };
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
