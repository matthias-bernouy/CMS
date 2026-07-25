import { describe, expect, test } from "bun:test";
import { parseConnectorSchemaContract } from "@bernouy/cms-integrations";
import { BASELINE_DIGEST, connector, evaluator, packageState, schemaContract } from "./fixtures";

describe("integration SQL schema compatibility", () => {
    test("accepts nullable or defaulted columns and rejects required columns", () => {
        const baseline = sqlPackage("1.0.0", schemaContract());
        const nullable = evaluateSchema(baseline, "1.1.0", schemaWithExtraColumn({ nullable: true }));
        const defaulted = evaluateSchema(baseline, "1.1.0", schemaWithExtraColumn({ nullable: false, default: "0" }));
        const required = evaluateSchema(baseline, "1.1.0", schemaWithExtraColumn({ nullable: false }));

        expect(nullable.accepted).toBeTrue();
        expect(defaulted.accepted).toBeTrue();
        expect(required).toMatchObject({ accepted: false, status: 422, report: { outcome: "breaking" } });
        expect(required.report.evidence).toContainEqual(expect.objectContaining({ code: "required-column-added" }));
    });

    test("requires a minor release for an added relation", () => {
        const baseline = sqlPackage("1.0.0", schemaContract());
        const patch = evaluateSchema(baseline, "1.0.1", schemaWithExtraRelation());
        const minor = evaluateSchema(baseline, "1.1.0", schemaWithExtraRelation());

        expect(patch).toMatchObject({ accepted: false, status: 422, report: { requiredReleaseLevel: "minor" } });
        expect(minor.accepted).toBeTrue();
        expect(minor.report.evidence).toContainEqual(expect.objectContaining({ code: "relation-added" }));
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

        expect(decision.accepted).toBe(accepted);
        expect(decision.report.evidence).toContainEqual(expect.objectContaining({ code }));
        if (code === "column-type-unproven") {
            expect(decision.report.outcome).toBe("unknown");
        }
    });

    test("fails closed when a legacy SQL baseline has no digest-bound reviewed contract", () => {
        const baseline = packageState("1.0.0", {
            connectors: [connector({ schemas: [{ path: "sql/schema.sql" }] })],
        });
        const decision = evaluateSchema(baseline, "1.0.1", schemaContract());

        expect(decision).toMatchObject({ accepted: false, status: 422, report: { outcome: "unknown" } });
        expect(decision.report.evidence).toContainEqual(
            expect.objectContaining({ code: "legacy-schema-baseline-missing" }),
        );
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
                    schema: parseConnectorSchemaContract(schemaContract(), "supabase"),
                    provenance: {
                        evidenceId: "ci-schema-1",
                        source: "official-bootstrap",
                        reviewedAt: "2026-07-26T09:00:00.000Z",
                    },
                },
            ],
        };

        expect(evaluateSchema(baseline, "1.0.1", schemaContract()).accepted).toBeTrue();
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
        const decision = evaluator().evaluateAdmission({
            baseline,
            candidate,
            changedPaths: ["connectors/supabase/sql/schema.sql"],
        });

        expect(decision.accepted).toBeTrue();
        expect(decision.report.outcome).toBe("compatible");
        expect(decision.report.evidence).toEqual([]);
    });

    test("rejects trusted SQL/declaration contradictions for patch and major publications", () => {
        const patchCandidate = withDeclarationEvidence(sqlPackage("1.0.1", schemaContract()), "contradiction");
        const majorCandidate = withDeclarationEvidence(sqlPackage("2.0.0", schemaContract()), "contradiction");
        const patch = evaluator().evaluateAdmission({
            baseline: sqlPackage("1.0.0", schemaContract()),
            candidate: patchCandidate,
        });
        const major = evaluator().evaluateAdmission({
            candidate: majorCandidate,
            noBaselineReason: "new-major",
            informationalBaseline: sqlPackage("1.0.0", schemaContract()),
        });

        for (const decision of [patch, major]) {
            expect(decision).toMatchObject({
                accepted: false,
                status: 422,
                report: { outcome: "invalid", requiredReleaseLevel: "none", admissible: false },
            });
            expect(decision.report.evidence).toContainEqual(
                expect.objectContaining({ classification: "invalid", code: "schema-declaration-contradiction" }),
            );
        }
    });
});

function evaluateSchema(baseline: ReturnType<typeof packageState>, version: string, schema: unknown) {
    return evaluator().evaluateAdmission({ baseline, candidate: sqlPackage(version, schema) });
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
