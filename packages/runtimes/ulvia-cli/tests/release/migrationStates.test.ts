import { describe, expect, test } from "bun:test";
import type { LocalReleasePackage } from "../../src/release/types";
import { distinctMigrationBaselines } from "../../src/release/verification/migrationStates";

describe("migration resilience matrix", () => {
    test("deduplicates baselines with the same durable connector state", () => {
        const candidate = release("2.0.0", [targetConnector()]);
        const baselines = [
            release("1.1.0", [sourceConnector(1)]),
            release("1.2.0", [sourceConnector(1)]),
            release("1.3.0", [sourceConnector(2)]),
        ];

        expect(distinctMigrationBaselines(candidate, baselines).map(version)).toEqual(["1.1.0", "1.3.0"]);
    });

    test("keeps separately adopted legacy package states", () => {
        const candidate = release("2.0.0", [
            targetConnector([legacySource("1.0.0", "a".repeat(64)), legacySource("1.0.1", "b".repeat(64))]),
        ]);
        const baselines = [release("1.0.0", [legacyConnector()]), release("1.0.1", [legacyConnector()])];

        expect(distinctMigrationBaselines(candidate, baselines).map(version)).toEqual(["1.0.0", "1.0.1"]);
    });
});

function release(version: string, connectors: unknown[]): LocalReleasePackage {
    return {
        package: { envelope: { version } },
        definition: { connectors },
    } as unknown as LocalReleasePackage;
}

function targetConnector(supportedSources: unknown[] = []) {
    return {
        connectorKey: "primary",
        provider: "supabase",
        root: "connectors/supabase",
        lineageId: "demo-v1",
        migration: { supportedSources },
    };
}

function sourceConnector(migrationRevision: number) {
    return {
        connectorKey: "primary",
        provider: "supabase",
        root: "connectors/supabase",
        lineageId: "demo-v1",
        migrationRevision,
        migration: {},
    };
}

function legacyConnector() {
    return { provider: "supabase", root: "connectors/supabase" };
}

function legacySource(range: string, packageDigest: string) {
    return { range, migrationRevision: 0, legacyAdoption: { packageDigest } };
}

function version(entry: LocalReleasePackage): string {
    return entry.package.envelope.version;
}
