import { describe, expect, test } from "bun:test";
import { isIntegrationReleaseFreshInstallOnly } from "../../../src/exports/index";

const SOURCE = {
    kind: "commerce",
    version: "1.0.0",
    packageDigest: "a".repeat(64),
};
const REQUIREMENT = {
    source: SOURCE,
    connectorKey: "primary",
    lineageId: "commerce-v1",
};

describe("fresh-install-only release decision", () => {
    test("requires a passed migration for every exact stateful requirement", () => {
        expect(decision([REQUIREMENT], [migration()])).toBe(false);
        expect(decision([REQUIREMENT], [migration({ outcome: "failed" })])).toBe(true);
        expect(decision([REQUIREMENT], [migration({ source: { ...SOURCE, packageDigest: "b".repeat(64) } })])).toBe(
            true,
        );
        expect(decision([{ ...REQUIREMENT, connectorKey: "secondary" }], [migration()])).toBe(true);
    });

    test("keeps a major without a migration path fresh-install-only", () => {
        expect(decision([], [], "major")).toBe(true);
        expect(decision([], [migration()], "major")).toBe(false);
        expect(decision([], [], "minor")).toBe(false);
    });
});

function decision(
    requiredMigrations: readonly (typeof REQUIREMENT)[],
    migrations: readonly ReturnType<typeof migration>[],
    releaseLevel: "major" | "minor" = "minor",
): boolean {
    return isIntegrationReleaseFreshInstallOnly({ releaseLevel, requiredMigrations, migrations });
}

function migration(overrides: Partial<ReturnType<typeof baseMigration>> = {}) {
    return { ...baseMigration(), ...overrides };
}

function baseMigration() {
    return {
        source: SOURCE,
        connectorKey: "primary",
        lineageId: "commerce-v1",
        outcome: "passed" as const,
    };
}
