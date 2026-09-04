import { describe, expect, test } from "bun:test";
import { evaluator, packageState } from "../fixtures";

describe("collection definition compatibility", () => {
    test("requires a major release when an existing resource disappears", () => {
        const baseline = collectionPackage("1.0.0", [resource()]);
        const decision = evaluator().evaluate({ baseline, candidate: collectionPackage("1.0.1", []) });

        expect(decision).toMatchObject({ contractAdmissible: false, outcome: "breaking" });
        expect(decision.evidence).toContainEqual(expect.objectContaining({ code: "collection-resource-removed" }));
    });

    test("allows a new inactive resource in a minor release", () => {
        const baseline = collectionPackage("1.0.0", [resource()]);
        const candidate = collectionPackage("1.1.0", [resource(), resource("demo/blocs/card", "card")]);
        const decision = evaluator().evaluate({ baseline, candidate });

        expect(decision).toMatchObject({ contractAdmissible: true, outcome: "compatible" });
        expect(decision.evidence).toContainEqual(expect.objectContaining({ code: "collection-resource-added" }));
    });

    test("rejects endpoint requirements added to an existing resource", () => {
        const baseline = collectionPackage("1.0.0", [resource()]);
        const candidate = collectionPackage("1.1.0", [resource("demo/blocs/text", "text", [endpoint()])]);
        const decision = evaluator().evaluate({ baseline, candidate });

        expect(decision).toMatchObject({ contractAdmissible: false, outcome: "breaking" });
        expect(decision.evidence).toContainEqual(
            expect.objectContaining({ code: "collection-endpoint-requirement-added" }),
        );
    });

    test("accepts widened source and endpoint contract ranges", () => {
        const baseline = collectionPackage("1.0.0", [resource("demo/blocs/text", "text", [endpoint("^1.1.0")])]);
        const candidate = collectionPackage("1.1.0", [resource("demo/blocs/text", "text", [endpoint("^1.0.0")])]);
        const decision = evaluator().evaluate({ baseline, candidate });

        expect(decision.contractAdmissible).toBeTrue();
        expect(decision.evidence).toContainEqual(expect.objectContaining({ code: "collection-source-range-widened" }));
    });

    test("requires a major release when an existing resource gains a resource dependency", () => {
        const baseline = collectionPackage("1.0.0", [resource()]);
        const candidate = collectionPackage("1.1.0", [
            { ...resource(), requires: { resources: ["demo/blocs/button"] } },
            resource("demo/blocs/button", "button"),
        ]);
        const decision = evaluator().evaluate({ baseline, candidate });

        expect(decision).toMatchObject({ contractAdmissible: false, outcome: "breaking" });
        expect(decision.evidence).toContainEqual(
            expect.objectContaining({ code: "collection-required-resource-added" }),
        );
    });

    test("requires a major release when a resource changes theme contract", () => {
        const baseline = collectionPackage("1.0.0", [
            { ...resource(), theme: { contract: "ulvia-theme@1", required: ["surface-background"] } },
        ]);
        const candidate = collectionPackage("1.1.0", [
            { ...resource(), theme: { contract: "ulvia-theme@2", required: ["surface-background"] } },
        ]);
        const decision = evaluator().evaluate({ baseline, candidate });

        expect(decision).toMatchObject({ contractAdmissible: false, outcome: "breaking" });
        expect(decision.evidence).toContainEqual(
            expect.objectContaining({ code: "collection-theme-contract-changed" }),
        );
    });

    test("detects integration type changes", () => {
        const baseline = collectionPackage("1.0.0", [resource()]);
        const candidate = packageState("1.0.1", {
            schema: "cms.integration.definition.v2",
            type: "source",
            artifacts: [],
        });
        const decision = evaluator().evaluate({ baseline, candidate });

        expect(decision).toMatchObject({ contractAdmissible: false, outcome: "breaking" });
        expect(decision.evidence).toContainEqual(expect.objectContaining({ code: "integration-type-changed" }));
    });
});

function collectionPackage(version: string, resources: unknown[]) {
    return packageState(version, {
        schema: "cms.integration.definition.v2",
        type: "collection",
        resourceCategories: [{ id: "content", label: "Content" }],
        resources,
        artifacts: resources.map((entry) => {
            const artifact = (entry as { artifact: string }).artifact;
            return { type: "bloc", bloc: { tag: artifact, name: artifact, compositionHTML: `<p>${artifact}</p>` } };
        }),
    });
}

function resource(id = "demo/blocs/text", artifact = "text", endpoints?: unknown[]) {
    return { id, type: "bloc", artifact, category: "content", ...(endpoints ? { endpoints } : {}) };
}

function endpoint(sourceVersion = "^1.0.0") {
    return {
        source: "content",
        sourceVersion,
        endpoint: "urn:content:list",
        contractVersion: "^1.0.0",
    };
}
