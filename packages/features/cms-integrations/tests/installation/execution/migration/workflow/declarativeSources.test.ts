import { describe, expect, test } from "bun:test";
import {
    runIntegrationInstallation,
    type DeclarativeAfterInstallationTemplate,
    type DeclarativeSourceArtifactTemplate,
    type IntegrationDefinition,
} from "@bernouy/cms-integrations";
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

    test("resolves the unique provider alias from a keyed connector during reconciliation", async () => {
        const fixture = await migrationFixture();
        const target = fakeMigrationTargetWithSource({
            providerDirectOnly: true,
            targetUrl: "{{connectors.supabase.functionsBaseUrl}}/setup",
        });
        const sources = new TrackingSourceRepository();
        await seedSourceInstallation(fixture, sources);

        await upgrade(fixture, target, sources);

        expect((await sources.getSource("urn:commerce-api"))?.endpoints[0]?.targetUrl).toBe(
            "https://target.example/functions/v1/setup",
        );
    });

    test("allows an unchanged deferred hook when its owned endpoint only switches targetUrl", async () => {
        const fixture = await migrationFixture();
        const sources = new TrackingSourceRepository();
        await seedSourceInstallation(fixture, sources);
        const dependencies = optionalDependencies();
        const hook: DeclarativeAfterInstallationTemplate = {
            id: "safe-deferred-hook",
            requires: ["optionalDep"],
            steps: [
                { id: "call-owned", call: { source: "{{answers.id}}", endpoint: "setup" } },
                {
                    id: "call-dependency",
                    call: { source: "{{dependencies.optionalDep.sourceId}}", endpoint: "refresh" },
                },
            ],
        };
        const target: IntegrationDefinition = {
            ...fakeMigrationTargetWithSource({
                providerDirectOnly: true,
                targetUrl: "{{connectors.supabase.functionsBaseUrl}}/setup",
            }),
            dependencies,
            afterInstallation: [hook],
        };
        await seedDeferredHookDefinition(fixture, dependencies, hook);

        await upgrade(fixture, target, sources);

        expect((await sources.getSource("urn:commerce-api"))?.endpoints[0]?.targetUrl).toBe(
            "https://target.example/functions/v1/setup",
        );
    });

    test("rejects a deferred hook when its optional requirement contract changes", async () => {
        const fixture = await migrationFixture();
        const sources = new TrackingSourceRepository();
        await seedSourceInstallation(fixture, sources);
        const hook: DeclarativeAfterInstallationTemplate = {
            id: "changed-requirement-hook",
            requires: ["optionalDep"],
            steps: [{ id: "call-owned", call: { source: "{{answers.id}}", endpoint: "setup" } }],
        };
        const sourceDependencies = [
            { name: "optionalDep", kind: "optional-dependency", versionRange: "^1.0.0", optional: true },
        ];
        const target: IntegrationDefinition = {
            ...fakeMigrationTargetWithSource({ providerDirectOnly: true }),
            dependencies: [{ ...sourceDependencies[0]!, versionRange: "^2.0.0" }],
            afterInstallation: [hook],
        };
        await seedDeferredHookDefinition(fixture, sourceDependencies, hook);

        await expect(upgrade(fixture, target, sources)).rejects.toThrow(/cannot prove deferred migration hooks safe/);
        expect(fixture.runtime.executions.size).toBe(0);
    });

    test("rejects a dependency call that the deferred hook does not require", async () => {
        const fixture = await migrationFixture();
        const sources = new TrackingSourceRepository();
        await seedSourceInstallation(fixture, sources);
        const dependencies = [
            ...optionalDependencies(),
            { name: "undeclaredCallDep", kind: "another-optional-dependency", optional: true },
        ];
        const hook: DeclarativeAfterInstallationTemplate = {
            id: "undeclared-dependency-call-hook",
            requires: ["optionalDep"],
            steps: [
                {
                    id: "call-dependency",
                    call: { source: "{{dependencies.undeclaredCallDep.sourceId}}", endpoint: "refresh" },
                },
            ],
        };
        const target: IntegrationDefinition = {
            ...fakeMigrationTargetWithSource({ providerDirectOnly: true }),
            dependencies,
            afterInstallation: [hook],
        };
        await seedDeferredHookDefinition(fixture, dependencies, hook);

        await expect(upgrade(fixture, target, sources)).rejects.toThrow(/cannot prove deferred migration hooks safe/);
        expect(fixture.runtime.executions.size).toBe(0);
    });

    test("rejects a missing hook requirement changed from optional to required", async () => {
        const fixture = await migrationFixture();
        const sources = new TrackingSourceRepository();
        await seedSourceInstallation(fixture, sources);
        const hook: DeclarativeAfterInstallationTemplate = {
            id: "required-dependency-hook",
            requires: ["optionalDep"],
            steps: [{ id: "call-owned", call: { source: "{{answers.id}}", endpoint: "setup" } }],
        };
        const sourceDependencies = optionalDependencies();
        const target: IntegrationDefinition = {
            ...fakeMigrationTargetWithSource({ providerDirectOnly: true }),
            dependencies: [{ name: "optionalDep", kind: "optional-dependency" }],
            afterInstallation: [hook],
        };
        await seedDeferredHookDefinition(fixture, sourceDependencies, hook);

        await expect(upgrade(fixture, target, sources)).rejects.toThrow(/requires integration/);
        expect(fixture.runtime.executions.size).toBe(0);
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
            dependencies: optionalDependencies(),
            afterInstallation: [
                {
                    id: "removed-source-hook",
                    requires: ["optionalDep"],
                    steps: [{ id: "call-removed", call: { source: "commerce-api", endpoint: "setup" } }],
                },
            ],
        };
        await seedDeferredHookDefinition(fixture, target.dependencies ?? [], target.afterInstallation![0]!);

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
            dependencies: optionalDependencies(),
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
        await seedDeferredHookDefinition(fixture, target.dependencies ?? [], hook);

        await expect(upgrade(fixture, target, sources)).rejects.toThrow(/cannot prove deferred migration hooks safe/);

        const operation = (await fixture.installations.get("commerce"))?.migrationOperation;
        expect(operation).toBeUndefined();
        expect(fixture.runtime.executions.size).toBe(0);
        expect((await sources.getSource("urn:commerce-api"))?.endpoints[0]?.targetUrl).toBe(
            "https://connector.example/v1/setup",
        );
    });

    for (const branch of ["steps", "onError"] as const) {
        test(`rejects a changed endpoint contract called from forEach.${branch}`, async () => {
            const fixture = await migrationFixture();
            const sources = new TrackingSourceRepository();
            await seedSourceInstallation(fixture, sources);
            const dependencies = optionalDependencies();
            const call = { id: "nested-call", call: { source: "{{answers.id}}", endpoint: "setup" } };
            const hook: DeclarativeAfterInstallationTemplate = {
                id: `nested-${branch}-hook`,
                requires: ["optionalDep"],
                steps: [
                    {
                        id: "items",
                        forEach: {
                            items: [],
                            max: 1,
                            steps: branch === "steps" ? [call] : [{ assert: { condition: { exists: "$item" } } }],
                            ...(branch === "onError" ? { continueOnError: true, onError: [call] } : {}),
                        },
                    },
                ],
            };
            const baseTarget = fakeMigrationTargetWithSource();
            const sourceArtifact = requiredSourceArtifact(baseTarget);
            const endpoint = sourceArtifact.source.endpoints[0]!;
            const target: IntegrationDefinition = {
                ...baseTarget,
                dependencies,
                afterInstallation: [hook],
                artifacts: [
                    {
                        ...sourceArtifact,
                        source: {
                            ...sourceArtifact.source,
                            endpoints: [{ ...endpoint, method: "PUT" }],
                        },
                    },
                ],
            };
            await seedDeferredHookDefinition(fixture, dependencies, hook);

            await expect(upgrade(fixture, target, sources)).rejects.toThrow(
                /cannot prove deferred migration hooks safe/,
            );
            expect(fixture.runtime.executions.size).toBe(0);
        });
    }
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

async function seedDeferredHookDefinition(
    fixture: Awaited<ReturnType<typeof migrationFixture>>,
    dependencies: NonNullable<IntegrationDefinition["dependencies"]>,
    hook: DeclarativeAfterInstallationTemplate,
): Promise<void> {
    const installed = await fixture.installations.get("commerce");
    if (!installed?.definitionSnapshot) {
        throw new Error("missing installed definition fixture");
    }
    const source = fakeMigrationTargetWithSource({ targetUrl: "https://connector.example/v1/setup" });
    await fixture.installations.replace({
        ...installed,
        definitionSnapshot: {
            ...installed.definitionSnapshot,
            inputs: source.inputs,
            dependencies,
            afterInstallation: [structuredClone(hook)],
            artifacts: source.artifacts,
        },
    });
}

function optionalDependencies(): NonNullable<IntegrationDefinition["dependencies"]> {
    return [{ name: "optionalDep", kind: "optional-dependency", optional: true }];
}

function requiredSourceArtifact(definition: IntegrationDefinition): DeclarativeSourceArtifactTemplate {
    const artifact = definition.artifacts?.find(
        (candidate): candidate is DeclarativeSourceArtifactTemplate => candidate.type === "source",
    );
    if (!artifact) {
        throw new Error("missing Source artifact fixture");
    }
    return artifact;
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
