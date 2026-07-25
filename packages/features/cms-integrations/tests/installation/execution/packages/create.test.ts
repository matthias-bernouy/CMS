import { describe, expect, test } from "bun:test";
import { runIntegrationInstallation, type IntegrationProvisioner } from "@bernouy/cms-integrations";
import {
    CapturingConnectorDeployer,
    connectorDefinition,
    FIRST_DIGEST,
    FIRST_PACKAGE_ROOT,
    packageLifecycleContext,
    RecordingPackageResolver,
    resolvedPackage,
} from "./packageFixture";

describe("package-backed integration creation", () => {
    test("deploys from the verified root and commits provenance with the installation", async () => {
        const context = packageLifecycleContext();
        const definition = connectorDefinition("1.0.0", "https://api.example.com/v1/items");
        const deployer = new CapturingConnectorDeployer();
        const resolver = new RecordingPackageResolver(() =>
            resolvedPackage(definition, FIRST_DIGEST, FIRST_PACKAGE_ROOT),
        );

        const result = await runIntegrationInstallation({
            mode: "create",
            deps: { sources: context.sources, secrets: context.secrets, connectorDeployers: [deployer] },
            installations: context.installations,
            packageResolver: resolver,
            siteIntegrations: [definition],
            dto: { kind: definition.kind, answers: { id: "rerun-source" }, options: {} },
        });

        expect(resolver.requests).toHaveLength(1);
        expect(resolver.requests[0]).toMatchObject({
            kind: definition.kind,
            version: "1.0.0",
            reason: "create",
            allowEmbeddedFallback: false,
        });
        expect(resolver.requests[0]?.expectedDigest).toBeUndefined();
        expect(resolver.requests[0]?.expectedDefinition?.version).toBe("1.0.0");
        expect(deployer.calls[0]?.deployment.root).toBe("connectors/capture");
        expect(deployer.calls[0]?.context.packageRoot).toBe(FIRST_PACKAGE_ROOT);
        expect(result.installation.packageDigest).toBe(FIRST_DIGEST);
        expect(result.installation.definitionVersion).toBe("1.0.0");
    });

    test("does not start secrets, provisions, connectors, artifacts, or persistence when resolution fails", async () => {
        const context = packageLifecycleContext();
        const provisionCalls: string[] = [];
        const deployer = new CapturingConnectorDeployer();
        const definition = {
            ...connectorDefinition("1.0.0", "https://api.example.com/v1/items"),
            generatedSecrets: [{ name: "token", key: "PACKAGE_TOKEN", bytes: 16 }],
            provisions: [
                {
                    provider: "capture-provision",
                    configuration: {},
                    outputs: [],
                },
            ],
        };
        const provisioner: IntegrationProvisioner = {
            provider: "capture-provision",
            async provision() {
                provisionCalls.push("provisioned");
                return { outputs: {} };
            },
        };
        const resolver = new RecordingPackageResolver(() => {
            throw new Error("repository unavailable");
        });

        await expect(
            runIntegrationInstallation({
                mode: "create",
                deps: {
                    sources: context.sources,
                    secrets: context.secrets,
                    connectorDeployers: [deployer],
                    provisioners: [provisioner],
                },
                installations: context.installations,
                packageResolver: resolver,
                siteIntegrations: [definition],
                dto: { kind: definition.kind, answers: { id: "rerun-source" }, options: {} },
            }),
        ).rejects.toThrow("repository unavailable");

        expect(provisionCalls).toEqual([]);
        expect(deployer.calls).toEqual([]);
        expect(await context.sources.getAllSources()).toEqual([]);
        expect(await context.secrets.get("PACKAGE_TOKEN")).toBeNull();
        expect(await context.installations.get(definition.kind)).toBeNull();
    });
});
