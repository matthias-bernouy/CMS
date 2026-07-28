import { describe, expect, test } from "bun:test";
import { runIntegrationInstallation, type IntegrationDefinition } from "@bernouy/cms-integrations";
import { rerunDefinition } from "../definitions";
import {
    CapturingConnectorDeployer,
    connectorDefinition,
    FIRST_DIGEST,
    FIRST_PACKAGE_ROOT,
    packageLifecycleContext,
    RecordingPackageResolver,
    resolvedPackage,
    SECOND_DIGEST,
    SECOND_PACKAGE_ROOT,
} from "./packageFixture";

describe("package-backed integration upgrades", () => {
    test("atomically commits the target version, snapshot, digest, and package root", async () => {
        const context = packageLifecycleContext();
        const installed = connectorDefinition("1.0.0", "https://api.example.com/v1/items");
        const target = connectorDefinition("1.1.0", "https://api.example.com/v2/items");
        const deployer = new CapturingConnectorDeployer();
        await createPinned(context, installed, deployer);
        const resolver = new RecordingPackageResolver(() =>
            resolvedPackage(target, SECOND_DIGEST, SECOND_PACKAGE_ROOT),
        );

        const result = await runIntegrationInstallation({
            mode: "upgrade",
            deps: { sources: context.sources, secrets: context.secrets, connectorDeployers: [deployer] },
            installations: context.installations,
            integrationId: installed.kind,
            targetDefinition: target,
            expectedPackageDigest: SECOND_DIGEST,
            packageResolver: resolver,
        });

        expect(resolver.requests[0]).toMatchObject({
            kind: target.kind,
            version: "1.1.0",
            reason: "upgrade",
            allowEmbeddedFallback: false,
        });
        expect(resolver.requests[0]?.expectedDigest).toBe(SECOND_DIGEST);
        expect(resolver.requests[0]?.expectedDefinition?.version).toBe("1.1.0");
        expect(deployer.calls.at(-1)?.context.packageRoot).toBe(SECOND_PACKAGE_ROOT);
        expect(result.installation.definitionVersion).toBe("1.1.0");
        expect(result.installation.definitionSnapshot?.version).toBe("1.1.0");
        expect(result.installation.packageDigest).toBe(SECOND_DIGEST);
    });

    test("rejects package bytes that do not match the exact composite release decision", async () => {
        const context = packageLifecycleContext();
        const installed = rerunDefinition("1.0.0", "https://api.example.com/v1/items");
        const target = rerunDefinition("1.1.0", "https://api.example.com/v2/items");
        await createPinned(context, installed);
        const before = await context.installations.get(installed.kind);
        const resolver = new RecordingPackageResolver(() =>
            resolvedPackage(target, SECOND_DIGEST, SECOND_PACKAGE_ROOT),
        );

        await expect(
            runIntegrationInstallation({
                mode: "upgrade",
                deps: { sources: context.sources, secrets: context.secrets },
                installations: context.installations,
                integrationId: installed.kind,
                targetDefinition: target,
                expectedPackageDigest: "f".repeat(64),
                packageResolver: resolver,
            }),
        ).rejects.toThrow(/repository returned an invalid response/i);

        expect(await context.installations.get(installed.kind)).toEqual(before);
    });

    test("leaves the complete pin untouched when package materialization runs out of disk", async () => {
        const context = packageLifecycleContext();
        const installed = rerunDefinition("1.0.0", "https://api.example.com/v1/items");
        const target = rerunDefinition("1.1.0", "https://api.example.com/v2/items");
        await createPinned(context, installed);
        const before = await context.installations.get(installed.kind);
        const resolver = new RecordingPackageResolver(() => {
            throw Object.assign(new Error("package cache staging has no space left"), { code: "ENOSPC" });
        });

        const failure = await runIntegrationInstallation({
            mode: "upgrade",
            deps: { sources: context.sources, secrets: context.secrets },
            installations: context.installations,
            integrationId: installed.kind,
            targetDefinition: target,
            packageResolver: resolver,
        }).catch((error) => error);

        expect(failure).toMatchObject({
            code: "ENOSPC",
            message: "package cache staging has no space left",
        });
        expect(resolver.requests).toHaveLength(1);
        expect(await context.installations.get(installed.kind)).toEqual(before);
    });

    test("does not enter pending or append a run when target resolution fails", async () => {
        const context = packageLifecycleContext();
        const installed = rerunDefinition("1.0.0", "https://api.example.com/v1/items");
        const target = rerunDefinition("1.1.0", "https://api.example.com/v2/items");
        await createPinned(context, installed);
        const before = await context.installations.get(installed.kind);
        const resolver = new RecordingPackageResolver(() => {
            throw new Error("target package unavailable");
        });

        await expect(
            runIntegrationInstallation({
                mode: "upgrade",
                deps: { sources: context.sources, secrets: context.secrets },
                installations: context.installations,
                integrationId: installed.kind,
                targetDefinition: target,
                packageResolver: resolver,
            }),
        ).rejects.toThrow("target package unavailable");

        expect(await context.installations.get(installed.kind)).toEqual(before);
    });

    test("restores the complete previous pin when post-installation reconciliation fails", async () => {
        const context = packageLifecycleContext();
        const installed = rerunDefinition("1.0.0", "https://api.example.com/v1/items");
        const target: IntegrationDefinition = {
            ...rerunDefinition("1.1.0", "https://api.example.com/v2/items"),
            afterInstallation: [
                {
                    id: "missing-source",
                    steps: [
                        {
                            id: "call",
                            call: { source: "missing-source", endpoint: "missing-endpoint" },
                        },
                    ],
                },
            ],
        };
        await createPinned(context, installed);
        const resolver = new RecordingPackageResolver(() =>
            resolvedPackage(target, SECOND_DIGEST, SECOND_PACKAGE_ROOT),
        );

        await expect(
            runIntegrationInstallation({
                mode: "upgrade",
                deps: { sources: context.sources, secrets: context.secrets },
                installations: context.installations,
                integrationId: installed.kind,
                targetDefinition: target,
                packageResolver: resolver,
            }),
        ).rejects.toThrow(/missing-source/);

        const after = await context.installations.get(installed.kind);
        expect(after?.status).toBe("failed");
        expect(after?.runCount).toBe(2);
        expect(after?.definitionVersion).toBe("1.0.0");
        expect(after?.definitionSnapshot?.version).toBe("1.0.0");
        expect(after?.packageDigest).toBe(FIRST_DIGEST);
        expect((await context.sources.getSource("urn:rerun-source"))?.endpoints[0]?.targetUrl).toBe(
            "https://api.example.com/v1/items",
        );
    });
});

async function createPinned(
    context: ReturnType<typeof packageLifecycleContext>,
    definition: IntegrationDefinition,
    connectorDeployer?: CapturingConnectorDeployer,
) {
    const resolver = new RecordingPackageResolver(() => resolvedPackage(definition, FIRST_DIGEST, FIRST_PACKAGE_ROOT));
    return await runIntegrationInstallation({
        mode: "create",
        deps: {
            sources: context.sources,
            secrets: context.secrets,
            ...(connectorDeployer ? { connectorDeployers: [connectorDeployer] } : {}),
        },
        installations: context.installations,
        siteIntegrations: [definition],
        dto: { kind: definition.kind, answers: { id: "rerun-source" }, options: {} },
        packageResolver: resolver,
    });
}
