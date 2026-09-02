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
        const candidate = releaseCandidate([
            migrationConnector([
                migration("expand-orders", 0, 1, "expand", "1.1.0"),
                migration("contract-orders", 1, 2, "contract", "2.0.0"),
            ]),
        ]);

        expect(() => assertSafeMigrationReleasePolicy(candidate, breakingSchemaCompatibility())).not.toThrow();
    });
});

function releaseCandidate(connectors: unknown[]): LocalReleasePackage {
    return {
        package: { envelope: { version: "2.0.0" } },
        definition: { kind: "demo", version: "2.0.0", connectors },
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

function migration(id: string, fromRevision: number, toRevision: number, phase: string, introducedIn: string) {
    return { id, fromRevision, toRevision, phase, introducedIn };
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
