import { describe, expect, test } from "bun:test";
import { BASELINE_DIGEST, connector, evaluator, packageState, schemaContract } from "../fixtures";

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

        const decision = evaluator().evaluate({ baseline, candidate });
        expect(decision).toMatchObject({ contractAdmissible: false, outcome: "breaking" });
        expect(decision.evidence).toContainEqual(expect.objectContaining({ code: "input-narrowed" }));
    });

    test("detects dependency range narrowing in the maintained SemVer direction", () => {
        const baseline = dependencyPackage("1.0.0", "^1.2.0");
        const narrowed = evaluator().evaluate({ baseline, candidate: dependencyPackage("1.0.1", "~1.2.0") });
        const widened = evaluator().evaluate({
            baseline,
            candidate: dependencyPackage("1.1.0", ">=1.0.0 <2.0.0"),
        });

        expect(narrowed).toMatchObject({ contractAdmissible: false, outcome: "breaking" });
        expect(narrowed.evidence).toContainEqual(expect.objectContaining({ code: "dependency-range-narrowed" }));
        expect(widened.contractAdmissible).toBeTrue();
        expect(widened.evidence).toContainEqual(expect.objectContaining({ code: "dependency-range-widened" }));
    });

    test("allows only an extension host floor to advance within its maintained major", () => {
        const baseline = extensionDependencyPackage("1.0.0", "^1.0.0");
        const allowed = evaluator().evaluate({
            baseline,
            candidate: extensionDependencyPackage("1.1.0", "^1.1.0"),
        });
        const ordinaryDependency = evaluator().evaluate({
            baseline: dependencyPackage("1.0.0", "^1.0.0"),
            candidate: dependencyPackage("1.1.0", "^1.1.0"),
        });
        const nextMajor = evaluator().evaluate({
            baseline,
            candidate: extensionDependencyPackage("1.1.0", "^2.0.0"),
        });

        expect(allowed).toMatchObject({ contractAdmissible: true, outcome: "compatible" });
        expect(allowed.evidence).toContainEqual(
            expect.objectContaining({
                classification: "additive",
                code: "extension-host-dependency-floor-raised",
            }),
        );
        for (const decision of [ordinaryDependency, nextMajor]) {
            expect(decision).toMatchObject({ contractAdmissible: false, outcome: "breaking" });
            expect(decision.evidence).toContainEqual(expect.objectContaining({ code: "dependency-range-narrowed" }));
        }
    });

    test("bounds a legacy dependency range only from every exact reviewed baseline pin", () => {
        const covered = evaluator().evaluate({
            baseline: reviewedLegacyDependencyPackage([["1.0.0"]]),
            candidate: dependencyPackage("1.1.0", "^1.0.0"),
        });
        expect(covered.contractAdmissible).toBeTrue();
        expect(covered.evidence).toContainEqual(
            expect.objectContaining({
                classification: "additive",
                code: "dependency-range-declared-from-reviewed-baseline",
            }),
        );

        const oneExcluded = evaluator().evaluate({
            baseline: reviewedLegacyDependencyPackage([["1.0.0"], ["2.0.0"]]),
            candidate: dependencyPackage("1.1.0", "^1.0.0"),
        });
        expect(oneExcluded).toMatchObject({ contractAdmissible: false, outcome: "breaking" });
        expect(oneExcluded.evidence).toContainEqual(expect.objectContaining({ code: "dependency-range-narrowed" }));
    });

    test("keeps an unreviewed or inapplicable legacy dependency range breaking", () => {
        const candidate = dependencyPackage("1.1.0", "^1.0.0");
        const absent = evaluator().evaluate({
            baseline: dependencyPackage("1.0.0"),
            candidate,
        });
        const noPin = evaluator().evaluate({
            baseline: reviewedLegacyDependencyPackage([[]]),
            candidate,
        });
        const wrongConnector = evaluator().evaluate({
            baseline: reviewedLegacyDependencyPackage([["1.0.0"]], "connectors/other"),
            candidate,
        });

        for (const decision of [absent, noPin, wrongConnector]) {
            expect(decision).toMatchObject({ contractAdmissible: false, outcome: "breaking" });
            expect(decision.evidence).toContainEqual(expect.objectContaining({ code: "dependency-range-narrowed" }));
        }
    });

    test("ignores implementation-only workflow steps when the declared function contract is stable", () => {
        const baseline = packageState("1.0.0", {
            artifacts: [functionArtifact([{ assert: { condition: { exists: true } } }])],
        });
        const candidate = packageState("1.0.1", { artifacts: [functionArtifact([])] });

        const decision = evaluator().evaluate({ baseline, candidate });
        expect(decision.contractAdmissible).toBeTrue();
        expect(decision.evidence).toEqual([]);
    });

    test("allows a Function contract version to advance in a minor release", () => {
        const baseline = packageState("1.0.0", {
            artifacts: [functionArtifact([], "1.0.0")],
        });
        const candidate = packageState("1.1.0", {
            artifacts: [functionArtifact([{ assert: { condition: { exists: true } } }], "1.1.0")],
        });

        const decision = evaluator().evaluate({ baseline, candidate });
        expect(decision).toMatchObject({ contractAdmissible: true, outcome: "compatible" });
        expect(decision.evidence).toContainEqual(
            expect.objectContaining({ classification: "additive", code: "endpoint-contract-version-advanced" }),
        );
    });

    test("allows bloc implementation and catalogue metadata changes in a patch release", () => {
        const baseline = packageState("1.0.0", {
            artifacts: [
                blocArtifact({
                    name: "Old logo",
                    group: "Brand",
                    description: "Old description",
                    path: "blocs/logo",
                    view: "Bloc.ts",
                    editor: "BlocEditor.ts",
                    viewJS: "old view",
                    editorJS: "old editor",
                    source: { "style.css": "old style" },
                }),
            ],
        });
        const candidate = packageState("1.0.1", {
            artifacts: [
                blocArtifact({
                    name: "Logo",
                    group: "Navigation",
                    description: "Corrected description",
                    path: "blocs/logo-v2",
                    composition: "template.html",
                    editor: null,
                    compositionHTML: "<span>Logo</span>",
                    editorJS: null,
                    source: { "style.css": "new style" },
                }),
            ],
        });

        const decision = evaluator().evaluate({ baseline, candidate });
        expect(decision).toMatchObject({ contractAdmissible: true, outcome: "compatible" });
        expect(decision.evidence).toEqual([]);
    });

    test("classifies bloc catalogue visibility changes", () => {
        const madeInternal = evaluator().evaluate({
            baseline: packageState("1.0.0", { artifacts: [blocArtifact()] }),
            candidate: packageState("1.0.1", { artifacts: [blocArtifact({ internal: true })] }),
        });
        const madePublic = evaluator().evaluate({
            baseline: packageState("1.0.0", { artifacts: [blocArtifact({ internal: true })] }),
            candidate: packageState("1.1.0", { artifacts: [blocArtifact()] }),
        });

        expect(madeInternal).toMatchObject({ contractAdmissible: false, outcome: "breaking" });
        expect(madeInternal.evidence).toContainEqual(expect.objectContaining({ code: "bloc-made-internal" }));
        expect(madePublic).toMatchObject({ contractAdmissible: true, outcome: "compatible" });
        expect(madePublic.evidence).toContainEqual(
            expect.objectContaining({ classification: "additive", code: "bloc-made-public" }),
        );
    });

    test("allows dashboard view fields and actions to be added in a minor release", () => {
        const baseline = packageState("1.0.0", {
            artifacts: [dashboardView([detailSection("summary", "status")])],
        });
        const candidate = packageState("1.1.0", {
            artifacts: [
                dashboardView(
                    [detailSection("summary", "status"), detailSection("fulfillment", "fulfillment.blockingReason")],
                    [
                        {
                            id: "reopenShippingWindow",
                            label: "Reopen shipping window",
                            form: { endpoint: "reopenShippingWindow" },
                        },
                    ],
                ),
            ],
        });

        const decision = evaluator().evaluate({ baseline, candidate });
        expect(decision).toMatchObject({ contractAdmissible: true, outcome: "compatible" });
        expect(decision.evidence).toContainEqual(expect.objectContaining({ code: "dashboard-view-extended" }));
    });

    test("keeps incompatible dashboard view edits conservative", () => {
        const baseline = packageState("1.0.0", { artifacts: [dashboardView([detailSection("summary", "status")])] });
        const candidate = packageState("1.1.0", { artifacts: [dashboardView([detailSection("details", "status")])] });

        const decision = evaluator().evaluate({ baseline, candidate });
        expect(decision).toMatchObject({ contractAdmissible: false, outcome: "unknown" });
        expect(decision.evidence).toContainEqual(expect.objectContaining({ code: "artifact-contract-changed" }));
    });
});

function dependencyPackage(version: string, versionRange?: string) {
    return packageState(version, {
        dependencies: [{ name: "commerce", kind: "commerce", ...(versionRange ? { versionRange } : {}) }],
        connectors: [connector({ compatibility: { schema: schemaContract() } })],
    });
}

function extensionDependencyPackage(version: string, versionRange: string) {
    return packageState(version, {
        extensionOf: { kind: "commerce" },
        dependencies: [{ name: "commerce", kind: "commerce", versionRange }],
        connectors: [connector({ compatibility: { schema: schemaContract() } })],
    });
}

function reviewedLegacyDependencyPackage(versions: readonly (readonly string[])[], root = "connectors/supabase") {
    const baseline = dependencyPackage("1.0.0");
    return {
        ...baseline,
        reviewedSchemaBaselines: versions.map((entries, index) => ({
            connector: { provider: "supabase", root },
            packageDigest: BASELINE_DIGEST,
            dependencies: entries.map((version) => ({
                kind: "commerce",
                version,
                packageDigest: String(index + 1).repeat(64),
            })),
            schema: schemaContract(),
            provenance: {
                evidenceId: `legacy-dependency-${index}`,
                source: "reviewed-test",
                reviewedAt: "2026-07-27T00:00:00.000Z",
            },
        })),
    };
}

function functionArtifact(steps: unknown[], contractVersion?: string) {
    return {
        type: "function",
        ...(contractVersion ? { contractVersion } : {}),
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

function blocArtifact(overrides: Record<string, unknown> = {}) {
    return {
        type: "bloc",
        bloc: {
            tag: "brand-logo",
            name: "Logo",
            compositionHTML: "<span>Logo</span>",
            ...overrides,
        },
    };
}

function dashboardView(main: unknown[], actions?: unknown[]) {
    return {
        type: "dashboard-view",
        view: {
            id: "order-detail",
            source: "commerce",
            views: [
                {
                    widget: "w-detail",
                    id: "orderDetail",
                    source: { endpoint: "getOrder" },
                    main,
                    actions: actions ?? [],
                },
            ],
        },
    };
}

function detailSection(id: string, path: string) {
    return {
        id,
        title: id,
        fields: [{ id: path, label: path, path, type: "readonly" }],
    };
}
