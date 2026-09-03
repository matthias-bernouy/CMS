import { describe, expect, test } from "bun:test";
import type { LocalCompatibilityResult } from "../../src/release/compatibility";
import type { LocalReleasePackage } from "../../src/release/types";
import { assertSafeMigrationReleasePolicy } from "../../src/release/verification/policy";

describe("local release migration policy", () => {
    test("rejects breaking stateful changes without a durable migration connector", () => {
        const candidate = releaseCandidate([{ provider: "supabase", root: "connectors/supabase" }]);

        expect(() => assertSafeMigrationReleasePolicy(candidate, breakingSchemaCompatibility())).toThrow(
            /requires a migration-aware connector.*major version alone/u,
        );
    });

    test("rejects additive schema changes without a durable migration connector", () => {
        const candidate = releaseCandidate([{ provider: "supabase", root: "connectors/supabase" }]);

        expect(() => assertSafeMigrationReleasePolicy(candidate, statefulCompatibility("schema", "additive"))).toThrow(
            /requires a migration-aware connector/u,
        );
    });

    test("requires blue-green deployment when function code changes behind the same contract", () => {
        const candidate = releaseCandidate([{ provider: "supabase", root: "connectors/supabase" }]);

        expect(() =>
            assertSafeMigrationReleasePolicy(
                candidate,
                statefulCompatibility("function", "compatible", "function-implementation-changed"),
            ),
        ).toThrow(/requires a migration-aware connector/u);
    });

    test("rejects expansion and contraction introduced by the same release", () => {
        const candidate = releaseCandidate([
            migrationConnector([
                migration("expand-orders", 0, 1, "expand", "2.0.0"),
                migration("contract-orders", 1, 2, "contract", "2.0.0"),
            ]),
        ]);

        expect(() => assertSafeMigrationReleasePolicy(candidate, breakingSchemaCompatibility())).toThrow(
            /introduces expand and contract migrations.*later release/u,
        );
    });

    test("accepts contraction only after an expansion shipped in an earlier release", () => {
        const expansion = migration("expand-orders", 0, 1, "expand", "1.1.0");
        const candidate = releaseCandidate([
            migrationConnector([expansion, migration("contract-orders", 1, 2, "contract", "2.0.0")]),
        ]);
        const baseline = releaseCandidate([migrationConnector([expansion])], "1.1.0");

        expect(() =>
            assertSafeMigrationReleasePolicy(candidate, breakingSchemaCompatibility(), [baseline]),
        ).not.toThrow();
    });

    test("rejects a migration backdated to a release absent from immutable history", () => {
        const candidate = releaseCandidate([
            migrationConnector([migration("invented-history", 0, 1, "expand", "1.1.0")]),
        ]);

        expect(() => assertSafeMigrationReleasePolicy(candidate, breakingSchemaCompatibility())).toThrow(
            /no immutable local baseline contains/u,
        );
    });

    test("rejects rewriting a migration already present in immutable history", () => {
        const baselineMigration = migration("expand-orders", 0, 1, "expand", "1.1.0", "a");
        const candidate = releaseCandidate([
            migrationConnector([
                migration("expand-orders", 0, 1, "expand", "1.1.0", "b"),
                migration("expand-items", 1, 2, "expand", "2.0.0"),
            ]),
        ]);
        const baseline = releaseCandidate([migrationConnector([baselineMigration])], "1.1.0");

        expect(() => assertSafeMigrationReleasePolicy(candidate, breakingSchemaCompatibility(), [baseline])).toThrow(
            /rewrites or removes published migration/u,
        );
    });

    test("rejects removing a published migration-aware connector", () => {
        const baseline = releaseCandidate(
            [migrationConnector([migration("expand-orders", 0, 1, "expand", "1.1.0")])],
            "1.1.0",
        );
        const candidate = releaseCandidate([]);

        expect(() => assertSafeMigrationReleasePolicy(candidate, compatibleDefinitionChange(), [baseline])).toThrow(
            /removes or renames published migration-aware connector/u,
        );
    });
});

function releaseCandidate(connectors: unknown[], version = "2.0.0"): LocalReleasePackage {
    return {
        package: { envelope: { version } },
        definition: { kind: "demo", version, connectors },
    } as unknown as LocalReleasePackage;
}

function migrationConnector(migrations: unknown[]) {
    return {
        provider: "supabase",
        root: "connectors/supabase",
        connectorKey: "primary",
        migration: { migrations },
    };
}

function migration(
    id: string,
    fromRevision: number,
    toRevision: number,
    phase: string,
    introducedIn: string,
    checksum = "a",
) {
    return { id, checksum: `sha256:${checksum.repeat(64)}`, fromRevision, toRevision, phase, introducedIn };
}

function breakingSchemaCompatibility(): LocalCompatibilityResult {
    return {
        evidence: [
            {
                surface: "schema",
                classification: "breaking",
                code: "column-removed",
                path: "connectors.supabase:connectors/supabase.schema.public.orders.legacy",
                message: "Column was removed",
            },
        ],
    } as LocalCompatibilityResult;
}

function statefulCompatibility(
    surface: "schema" | "function",
    classification: "additive" | "compatible",
    code = "column-added",
): LocalCompatibilityResult {
    return {
        evidence: [
            {
                surface,
                classification,
                code,
                path: `connectors.supabase:connectors/supabase.${surface}`,
                message: "Stateful implementation changed",
            },
        ],
    } as LocalCompatibilityResult;
}

function compatibleDefinitionChange(): LocalCompatibilityResult {
    return { evidence: [] } as unknown as LocalCompatibilityResult;
}
