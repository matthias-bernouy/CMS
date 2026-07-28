import { describe, expect, test } from "bun:test";
import { runIntegrationInstallation, type IntegrationDefinition } from "@bernouy/cms-integrations";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import { InMemorySourceRepository } from "@bernouy/cms-sources";
import { MIGRATION_DIGEST, migrationFixture } from "../fakeRuntimeFixture";

describe("migration-aware upgrade request guards", () => {
    test("rejects input overrides instead of silently ignoring them", async () => {
        const fixture = await migrationFixture();

        await expect(upgrade(fixture, fixture.target, { version: "1.1.0", answers: { region: "eu" } })).rejects.toThrow(
            /does not support fields: answers/,
        );
        expect(fixture.runtime.executions.size).toBe(0);
    });

    test("rejects a body version that contradicts the immutable target", async () => {
        const fixture = await migrationFixture();

        await expect(upgrade(fixture, fixture.target, { version: "1.2.0" })).rejects.toThrow(
            /body must match the exact target version/,
        );
        expect(fixture.runtime.executions.size).toBe(0);
    });

    test("rejects a target that mixes migration-aware and ordinary connectors", async () => {
        const fixture = await migrationFixture();
        const target: IntegrationDefinition = {
            ...fixture.target,
            connectors: [...(fixture.target.connectors ?? []), { provider: "legacy", configuration: {}, outputs: [] }],
        };

        await expect(upgrade(fixture, target)).rejects.toThrow(/connectors without a migration plan: legacy/);
        expect(fixture.runtime.executions.size).toBe(0);
    });

    test("rejects resources that the durable migration path cannot reconcile", async () => {
        const fixture = await migrationFixture();
        const target: IntegrationDefinition = {
            ...fixture.target,
            generatedSecrets: [{ name: "token", key: "MIGRATION_TOKEN", bytes: 32 }],
        };

        await expect(upgrade(fixture, target)).rejects.toThrow(/cannot change declarative generatedSecrets/);
        expect(fixture.runtime.executions.size).toBe(0);
    });

    test("rejects after-installation hook changes that have no idempotent migration protocol", async () => {
        const fixture = await migrationFixture();
        const target: IntegrationDefinition = {
            ...fixture.target,
            afterInstallation: [{ id: "new-hook", steps: [] }],
        };

        await expect(upgrade(fixture, target)).rejects.toThrow(/cannot change declarative afterInstallation/);
        expect(fixture.runtime.executions.size).toBe(0);
    });

    test("only resumes the exact target of an unfinished migration", async () => {
        const fixture = await migrationFixture();
        fixture.runtime.failAfterRemote = "expand";
        await expect(upgrade(fixture, fixture.target)).rejects.toThrow(/injected expand/);
        fixture.runtime.failAfterRemote = undefined;

        const ordinaryTarget: IntegrationDefinition = {
            ...fixture.target,
            version: "1.2.0",
            connectors: [],
        };
        await expect(upgrade(fixture, ordinaryTarget)).rejects.toThrow(/only its exact target can be resumed/);
        await expect(upgrade(fixture, fixture.target, undefined, "a".repeat(64))).rejects.toThrow(
            /only resume its exact target package/,
        );

        expect(fixture.runtime.executions.get("expand")).toBe(1);
        expect((await fixture.installations.get("commerce"))?.migrationOperation?.status).toBe("paused");
    });
});

async function upgrade(
    fixture: Awaited<ReturnType<typeof migrationFixture>>,
    target: IntegrationDefinition,
    body?: Record<string, unknown>,
    digest = MIGRATION_DIGEST,
) {
    return await runIntegrationInstallation({
        mode: "upgrade",
        deps: {
            sources: new InMemorySourceRepository(),
            secrets: new InMemorySecretStore(),
            migrationRuntime: fixture.runtime,
            migrationClock: fixture.clock,
        },
        installations: fixture.installations,
        integrationId: "commerce",
        targetDefinition: target,
        body,
        packageResolver: {
            resolve: async () => ({
                root: "/tmp/cms-migration-request-guard",
                kind: "commerce",
                version: target.version as string,
                digest,
                definition: target,
            }),
        },
    });
}
