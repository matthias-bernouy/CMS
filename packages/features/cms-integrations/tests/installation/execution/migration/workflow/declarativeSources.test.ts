import { describe, expect, test } from "bun:test";
import { runIntegrationInstallation, type IntegrationDefinition } from "@bernouy/cms-integrations";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import { InMemorySourceRepository, sourceDtoToSource, type Source } from "@bernouy/cms-sources";
import { fakeMigrationTargetWithSource } from "../fakeRuntimeDefinition";
import { MIGRATION_DIGEST, migrationFixture } from "../fakeRuntimeFixture";

describe("migration target Source reconciliation", () => {
    test("writes a provider-direct target Source that was not switched by the migration runtime", async () => {
        const fixture = await migrationFixture();
        const target = fakeMigrationTargetWithSource({ providerDirectOnly: true });
        const sources = new TrackingSourceRepository();
        await seedSourceInstallation(fixture, sources);

        const upgraded = await upgrade(fixture, target, sources);

        expect(sources.updateCount).toBe(1);
        expect((await sources.getSource("urn:commerce-api"))?.endpoints[0]?.targetUrl).toBe(
            "https://connector.example/v2/setup",
        );
        expect(upgraded.run.artifacts).toContainEqual({
            type: "source",
            id: "urn:commerce-api",
            action: "updated",
        });
    });

    test("deletes a Source removed by the target definition", async () => {
        const fixture = await migrationFixture();
        const sources = new TrackingSourceRepository();
        await seedSourceInstallation(fixture, sources);

        const upgraded = await upgrade(fixture, fixture.target, sources);

        expect(await sources.getSource("urn:commerce-api")).toBeNull();
        expect(upgraded.installation.artifacts.some((artifact) => artifact.type === "source")).toBeFalse();
    });

    test("rejects deferred target hooks when an owned Source is removed before the point of no return", async () => {
        const fixture = await migrationFixture();
        const sources = new TrackingSourceRepository();
        await seedSourceInstallation(fixture, sources);
        const target: IntegrationDefinition = {
            ...fixture.target,
            dependencies: [{ name: "optionalDep", kind: "optional-dependency", optional: true }],
            afterInstallation: [
                {
                    id: "removed-source-hook",
                    requires: ["optionalDep"],
                    steps: [{ id: "call-removed", call: { source: "commerce-api", endpoint: "setup" } }],
                },
            ],
        };
        const installed = await fixture.installations.get("commerce");
        if (!installed?.definitionSnapshot) {
            throw new Error("missing installed definition fixture");
        }
        await fixture.installations.replace({
            ...installed,
            definitionSnapshot: {
                ...installed.definitionSnapshot,
                dependencies: target.dependencies,
                afterInstallation: target.afterInstallation,
            },
        });

        await expect(upgrade(fixture, target, sources)).rejects.toThrow(/cannot prove deferred migration hooks safe/);

        const operation = (await fixture.installations.get("commerce"))?.migrationOperation;
        expect(operation).toBeUndefined();
        expect(fixture.runtime.executions.size).toBe(0);
        expect(await sources.getSource("urn:commerce-api")).not.toBeNull();
    });

    test("rejects a deferred hook whose endpoint disappears from a retained Source", async () => {
        const fixture = await migrationFixture();
        const sources = new TrackingSourceRepository();
        await seedSourceInstallation(fixture, sources);
        const baseTarget = fakeMigrationTargetWithSource();
        const baseSourceArtifact = baseTarget.artifacts?.[0];
        if (!baseSourceArtifact || baseSourceArtifact.type !== "source") {
            throw new Error("missing target Source fixture");
        }
        const baseEndpoint = baseSourceArtifact.source.endpoints[0];
        if (!baseEndpoint) {
            throw new Error("missing target Source endpoint fixture");
        }
        const hook = {
            id: "renamed-endpoint-hook",
            requires: ["optionalDep"],
            steps: [{ id: "call-old-endpoint", call: { source: "commerce-api", endpoint: "setup" } }],
        };
        const target: IntegrationDefinition = {
            ...baseTarget,
            dependencies: [{ name: "optionalDep", kind: "optional-dependency", optional: true }],
            afterInstallation: [hook],
            artifacts: [
                {
                    type: "source",
                    source: {
                        ...baseSourceArtifact.source,
                        endpoints: [
                            {
                                ...baseEndpoint,
                                endpointId: "setup-v2",
                            },
                        ],
                    },
                },
            ],
        };
        const installed = await fixture.installations.get("commerce");
        if (!installed?.definitionSnapshot) {
            throw new Error("missing installed definition fixture");
        }
        await fixture.installations.replace({
            ...installed,
            definitionSnapshot: {
                ...installed.definitionSnapshot,
                dependencies: target.dependencies,
                afterInstallation: target.afterInstallation,
            },
        });

        await expect(upgrade(fixture, target, sources)).rejects.toThrow(/cannot prove deferred migration hooks safe/);

        const operation = (await fixture.installations.get("commerce"))?.migrationOperation;
        expect(operation).toBeUndefined();
        expect(fixture.runtime.executions.size).toBe(0);
        expect((await sources.getSource("urn:commerce-api"))?.endpoints[0]?.targetUrl).toBe(
            "https://connector.example/v1/setup",
        );
    });
});

class TrackingSourceRepository extends InMemorySourceRepository {
    updateCount = 0;

    override async updateSource(source: Source): Promise<Source | null> {
        this.updateCount += 1;
        return await super.updateSource(source);
    }
}

async function seedSourceInstallation(
    fixture: Awaited<ReturnType<typeof migrationFixture>>,
    sources: InMemorySourceRepository,
): Promise<void> {
    await sources.createSource(
        sourceDtoToSource({
            id: "commerce-api",
            identityAuthority: "commerce",
            meta: { name: "Commerce" },
            endpoints: [
                {
                    endpointId: "setup",
                    method: "POST",
                    access: { mode: "system" },
                    targetUrl: "https://connector.example/v1/setup",
                    params: [],
                    output: [{ status: "200", body: { type: "object" } }],
                },
            ],
        }),
    );
    const installed = await fixture.installations.get("commerce");
    if (!installed) {
        throw new Error("missing integration fixture");
    }
    await fixture.installations.replace({
        ...installed,
        answersSnapshot: { id: "commerce-api" },
        artifacts: [{ type: "source", id: "urn:commerce-api", action: "created" }],
    });
}

async function upgrade(
    fixture: Awaited<ReturnType<typeof migrationFixture>>,
    target: IntegrationDefinition,
    sources: InMemorySourceRepository,
) {
    return await runIntegrationInstallation({
        mode: "upgrade",
        deps: {
            sources,
            secrets: new InMemorySecretStore(),
            migrationRuntime: fixture.runtime,
            migrationClock: fixture.clock,
        },
        installations: fixture.installations,
        integrationId: "commerce",
        targetDefinition: target,
        packageResolver: {
            resolve: async () => ({
                root: "/tmp/cms-migration-source-target",
                kind: "commerce",
                version: "1.1.0",
                digest: MIGRATION_DIGEST,
                definition: target,
            }),
        },
    });
}
