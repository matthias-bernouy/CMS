import { describe, expect, test } from "bun:test";
import { parseConnectorSchemaContract } from "@bernouy/cms-integrations";
import { BASELINE_DIGEST, connector, evaluator, packageState, schemaContract } from "./fixtures";

describe("integration SQL schema compatibility", () => {
    test("accepts nullable or defaulted columns and rejects required columns", () => {
        const baseline = sqlPackage("1.0.0", schemaContract());
        const nullable = evaluateSchema(baseline, "1.1.0", schemaWithExtraColumn({ nullable: true }));
        const defaulted = evaluateSchema(baseline, "1.1.0", schemaWithExtraColumn({ nullable: false, default: "0" }));
        const required = evaluateSchema(baseline, "1.1.0", schemaWithExtraColumn({ nullable: false }));

        expect(nullable.contractAdmissible).toBeTrue();
        expect(defaulted.contractAdmissible).toBeTrue();
        expect(required).toMatchObject({ contractAdmissible: false, outcome: "breaking" });
        expect(required.evidence).toContainEqual(expect.objectContaining({ code: "required-column-added" }));
    });

    test("requires a minor release for an added relation", () => {
        const baseline = sqlPackage("1.0.0", schemaContract());
        const patch = evaluateSchema(baseline, "1.0.1", schemaWithExtraRelation());
        const minor = evaluateSchema(baseline, "1.1.0", schemaWithExtraRelation());

        expect(patch).toMatchObject({ contractAdmissible: false, requiredReleaseLevel: "minor" });
        expect(minor.contractAdmissible).toBeTrue();
        expect(minor.evidence).toContainEqual(expect.objectContaining({ code: "relation-added" }));
    });

    test.each([
        ["smallint", "bigint", true, "column-type-widened"],
        ["character varying(40)", "text", true, "column-type-widened"],
        ["bigint", "integer", false, "column-type-narrowed"],
        ["bigint", "text", false, "column-type-unproven"],
    ])("classifies provider type change %s -> %s", (previous, next, accepted, code) => {
        const decision = evaluateSchema(
            sqlPackage("1.0.0", schemaContract({ type: previous })),
            "1.1.0",
            schemaContract({ type: next }),
        );

        expect(decision.contractAdmissible).toBe(accepted);
        expect(decision.evidence).toContainEqual(expect.objectContaining({ code }));
        if (code === "column-type-unproven") {
            expect(decision.outcome).toBe("unknown");
        }
    });

    test("fails closed when a legacy SQL baseline has no digest-bound reviewed contract", () => {
        const baseline = packageState("1.0.0", {
            connectors: [connector({ schemas: [{ path: "sql/schema.sql" }] })],
        });
        const decision = evaluateSchema(baseline, "1.0.1", schemaContract());

        expect(decision).toMatchObject({ contractAdmissible: false, outcome: "unknown" });
        expect(decision.evidence).toContainEqual(expect.objectContaining({ code: "legacy-schema-baseline-missing" }));
    });

    test("uses only a reviewed legacy baseline bound to the immutable package digest", () => {
        const legacy = packageState("1.0.0", {
            connectors: [connector({ schemas: [{ path: "sql/schema.sql" }] })],
        });
        const baseline = {
            ...legacy,
            reviewedSchemaBaselines: [
                {
                    connector: { provider: "supabase", root: "connectors/supabase" },
                    packageDigest: BASELINE_DIGEST,
                    dependencies: [],
                    schema: parseConnectorSchemaContract(schemaContract(), "supabase"),
                    provenance: {
                        evidenceId: "ci-schema-1",
                        source: "official-bootstrap",
                        reviewedAt: "2026-07-26T09:00:00.000Z",
                    },
                },
            ],
        };

        expect(evaluateSchema(baseline, "1.0.1", schemaContract()).contractAdmissible).toBeTrue();
        expect(() =>
            evaluateSchema(
                {
                    ...baseline,
                    reviewedSchemaBaselines: [
                        { ...baseline.reviewedSchemaBaselines[0]!, packageDigest: "c".repeat(64) },
                    ],
                },
                "1.0.1",
                schemaContract(),
            ),
        ).toThrow(/bound to its package digest/);
    });

    test("treats changed SQL bytes as implementation-only when the declaration is unchanged", () => {
        const baseline = sqlPackage("1.0.0", schemaContract());
        const candidate = sqlPackage("1.0.1", schemaContract());
        const decision = evaluator().evaluate({
            baseline,
            candidate,
            changedPaths: ["connectors/supabase/sql/schema.sql"],
        });

        expect(decision.contractAdmissible).toBeTrue();
        expect(decision.outcome).toBe("compatible");
        expect(decision.evidence).toEqual([]);
    });

    test("classifies relation kinds and generated-column semantics", () => {
        const baseline = schemaContract() as {
            namespaces: Array<{ relations: Array<Record<string, unknown>> }>;
        };
        const changedKind = structuredClone(baseline);
        changedKind.namespaces[0]!.relations[0]!.kind = "view";
        expect(evaluateSchema(sqlPackage("1.0.0", baseline), "1.1.0", changedKind).evidence).toContainEqual(
            expect.objectContaining({ code: "relation-kind-changed", classification: "breaking" }),
        );

        const alwaysIdentity = schemaWithIdGeneration({ identity: "always" });
        const defaultIdentity = schemaWithIdGeneration({ identity: "by-default" });
        const identityDecision = evaluateSchema(sqlPackage("1.0.0", alwaysIdentity), "1.1.0", defaultIdentity);
        expect(identityDecision.contractAdmissible).toBeTrue();
        expect(identityDecision.evidence).toContainEqual(
            expect.objectContaining({ code: "column-identity-changed", classification: "additive" }),
        );

        const sequenceBaseline = schemaWithIdGeneration({ default: "nextval('orders_id_seq'::regclass)" });
        const ownedSequence = schemaWithIdGeneration({
            default: "nextval('orders_id_seq'::regclass)",
            sequenceDependency: "auto",
        });
        expect(evaluateSchema(sqlPackage("1.0.0", sequenceBaseline), "1.1.0", ownedSequence).evidence).toContainEqual(
            expect.objectContaining({ code: "column-sequence-ownership-changed", classification: "unknown" }),
        );
    });

    test("rejects trusted SQL/declaration contradictions for patch and major publications", () => {
        const patchCandidate = withDeclarationEvidence(sqlPackage("1.0.1", schemaContract()), "contradiction");
        const majorCandidate = withDeclarationEvidence(sqlPackage("2.0.0", schemaContract()), "contradiction");
        const patch = evaluator().evaluate({
            baseline: sqlPackage("1.0.0", schemaContract()),
            candidate: patchCandidate,
        });
        const major = evaluator().evaluate({
            candidate: majorCandidate,
            noBaselineReason: "new-major",
            informationalBaseline: sqlPackage("1.0.0", schemaContract()),
        });

        for (const decision of [patch, major]) {
            expect(decision).toMatchObject({
                outcome: "invalid",
                requiredReleaseLevel: "none",
                contractAdmissible: false,
            });
            expect(decision.evidence).toContainEqual(
                expect.objectContaining({ classification: "invalid", code: "schema-declaration-contradiction" }),
            );
        }
    });
});

function evaluateSchema(baseline: ReturnType<typeof packageState>, version: string, schema: unknown) {
    return evaluator().evaluate({ baseline, candidate: sqlPackage(version, schema) });
}

function sqlPackage(version: string, schema: unknown) {
    return packageState(version, {
        connectors: [
            connector({
                schemas: [{ path: "sql/schema.sql" }],
                compatibility: { schema },
            }),
        ],
    });
}

function schemaWithExtraColumn(overrides: Record<string, unknown>) {
    const schema = schemaContract() as {
        namespaces: Array<{ relations: Array<{ columns: Array<Record<string, unknown>> }> }>;
    };
    schema.namespaces[0]!.relations[0]!.columns.push({ name: "note", type: "text", ...overrides });
    return schema;
}

function schemaWithExtraRelation() {
    const schema = schemaContract() as {
        namespaces: Array<{ relations: Array<Record<string, unknown>> }>;
    };
    schema.namespaces[0]!.relations.push({
        name: "notes",
        columns: [{ name: "id", type: "bigint", nullable: false }],
        constraints: [],
    });
    return schema;
}

function schemaWithIdGeneration(generation: Record<string, unknown>) {
    const schema = schemaContract() as {
        namespaces: Array<{ relations: Array<{ columns: Array<Record<string, unknown>> }> }>;
    };
    Object.assign(schema.namespaces[0]!.relations[0]!.columns[0]!, generation);
    return schema;
}

function withDeclarationEvidence(packageValue: ReturnType<typeof sqlPackage>, verdict: "consistent" | "contradiction") {
    return {
        ...packageValue,
        schemaDeclarationEvidence: [
            {
                evidenceId: "schema-ci-1",
                packageDigest: packageValue.packageDigest,
                connector: { provider: "supabase", root: "connectors/supabase" },
                producer: { name: "schema-verifier", version: "1.0.0" },
                createdAt: "2026-07-26T09:30:00.000Z",
                verdict,
            },
        ],
    } as const;
}
