import { describe, expect, test } from "bun:test";
import {
    runIntegrationInstallation,
    type IntegrationConnectorDeployer,
    type IntegrationDefinition,
} from "@bernouy/cms-integrations";
import {
    connectorDefinition,
    FIRST_DIGEST,
    FIRST_PACKAGE_ROOT,
    packageLifecycleContext,
    RecordingPackageResolver,
    resolvedPackage,
} from "./packageFixture";

const failingDeployer: IntegrationConnectorDeployer = {
    provider: "capture",
    async deploy() {
        throw new Error("connector deployment failed");
    },
};

describe("package provenance commit failures", () => {
    test("does not create an installation when deployment fails after package resolution", async () => {
        const context = packageLifecycleContext();
        const definition = connectorDefinition("1.0.0", "https://api.example.com/v1/items");
        const resolver = resolverFor(definition);

        await expect(
            runIntegrationInstallation({
                mode: "create",
                deps: {
                    sources: context.sources,
                    secrets: context.secrets,
                    connectorDeployers: [failingDeployer],
                },
                installations: context.installations,
                packageResolver: resolver,
                siteIntegrations: [definition],
                dto: { kind: definition.kind, answers: { id: "rerun-source" }, options: {} },
            }),
        ).rejects.toThrow("connector deployment failed");

        expect(resolver.requests).toHaveLength(1);
        expect(await context.installations.get(definition.kind)).toBeNull();
        expect(await context.sources.getAllSources()).toEqual([]);
    });

    test("does not backfill a legacy digest when rerun deployment fails", async () => {
        const context = packageLifecycleContext();
        const definition = connectorDefinition("1.0.0", "https://api.example.com/v1/items");
        const successfulDeployer: IntegrationConnectorDeployer = {
            provider: "capture",
            async deploy() {
                return { provider: "capture" };
            },
        };
        const created = await runIntegrationInstallation({
            mode: "create",
            deps: {
                sources: context.sources,
                secrets: context.secrets,
                connectorDeployers: [successfulDeployer],
            },
            installations: context.installations,
            siteIntegrations: [definition],
            dto: { kind: definition.kind, answers: { id: "rerun-source" }, options: {} },
        });
        const resolver = resolverFor(definition);

        await expect(
            runIntegrationInstallation({
                mode: "rerun",
                deps: {
                    sources: context.sources,
                    secrets: context.secrets,
                    connectorDeployers: [failingDeployer],
                },
                installations: context.installations,
                integrationId: definition.kind,
                packageResolver: resolver,
            }),
        ).rejects.toThrow("connector deployment failed");

        const after = await context.installations.get(definition.kind);
        expect(after?.status).toBe("success");
        expect(after?.runCount).toBe(2);
        expect(after?.definitionVersion).toBe(created.installation.definitionVersion);
        expect(after?.definitionSnapshot).toEqual(created.installation.definitionSnapshot);
        expect(after?.packageDigest).toBeUndefined();
    });
});

function resolverFor(definition: IntegrationDefinition): RecordingPackageResolver {
    return new RecordingPackageResolver(() => resolvedPackage(definition, FIRST_DIGEST, FIRST_PACKAGE_ROOT));
}
