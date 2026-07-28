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

describe("package-backed integration reruns", () => {
    test("resolves the installed digest and never changes the pin", async () => {
        const context = packageLifecycleContext();
        const definition = connectorDefinition("1.0.0", "https://api.example.com/v1/items");
        const deployer = new CapturingConnectorDeployer();
        const resolver = new RecordingPackageResolver(() =>
            resolvedPackage(definition, FIRST_DIGEST, FIRST_PACKAGE_ROOT),
        );
        await create(context, definition, resolver, deployer);

        const result = await runIntegrationInstallation({
            mode: "rerun",
            deps: { sources: context.sources, secrets: context.secrets, connectorDeployers: [deployer] },
            installations: context.installations,
            integrationId: definition.kind,
            packageResolver: resolver,
        });

        expect(resolver.requests[1]).toMatchObject({
            kind: definition.kind,
            version: "1.0.0",
            reason: "rerun",
            expectedDigest: FIRST_DIGEST,
            allowEmbeddedFallback: false,
        });
        expect(resolver.requests[1]?.expectedDefinition?.version).toBe("1.0.0");
        expect(deployer.calls[1]?.context.packageRoot).toBe(FIRST_PACKAGE_ROOT);
        expect(result.installation.packageDigest).toBe(FIRST_DIGEST);
        expect(result.installation.definitionVersion).toBe("1.0.0");
        expect(result.installation.runCount).toBe(2);
    });

    test("reconstructs an exact legacy definition from the package and records its first digest", async () => {
        const context = packageLifecycleContext();
        const original = rerunDefinition("1.0.0", "https://api.example.com/v1/items");
        const packaged = rerunDefinition("1.0.0", "https://api.example.com/reconstructed/items");
        const created = await create(context, original);
        await context.installations.replace({ ...created.installation, definitionSnapshot: undefined });
        const resolver = new RecordingPackageResolver(() =>
            resolvedPackage(packaged, SECOND_DIGEST, SECOND_PACKAGE_ROOT),
        );

        const result = await runIntegrationInstallation({
            mode: "rerun",
            deps: { sources: context.sources, secrets: context.secrets },
            installations: context.installations,
            integrationId: original.kind,
            packageResolver: resolver,
        });

        expect(resolver.requests[0]).toEqual({
            kind: original.kind,
            version: "1.0.0",
            reason: "rerun",
            expectedDigest: undefined,
            expectedDefinition: undefined,
            allowEmbeddedFallback: true,
        });
        expect(result.installation.packageDigest).toBe(SECOND_DIGEST);
        expect(result.installation.definitionSnapshot).toBeUndefined();
        expect((await context.sources.getSource("urn:rerun-source"))?.endpoints[0]?.targetUrl).toBe(
            "https://api.example.com/reconstructed/items",
        );
    });

    test("keeps unversioned legacy snapshots without fabricating provenance", async () => {
        const context = packageLifecycleContext();
        const definition: IntegrationDefinition = {
            ...rerunDefinition("1.0.0", "https://api.example.com/legacy/items"),
            version: undefined,
        };
        await create(context, definition);
        const resolver = new RecordingPackageResolver(() => {
            throw new Error("unversioned packages must not resolve");
        });

        const result = await runIntegrationInstallation({
            mode: "rerun",
            deps: { sources: context.sources, secrets: context.secrets },
            installations: context.installations,
            integrationId: definition.kind,
            packageResolver: resolver,
        });

        expect(resolver.requests).toEqual([]);
        expect(result.installation.definitionVersion).toBe("unversioned");
        expect(result.installation.definitionSnapshot?.version).toBeUndefined();
        expect(result.installation.packageDigest).toBeUndefined();
    });

    test("leaves status, run history, and the full pin untouched when resolution fails", async () => {
        const context = packageLifecycleContext();
        const definition = rerunDefinition("1.0.0", "https://api.example.com/v1/items");
        const resolver = new RecordingPackageResolver(() =>
            resolvedPackage(definition, FIRST_DIGEST, FIRST_PACKAGE_ROOT),
        );
        await create(context, definition, resolver);
        const before = await context.installations.get(definition.kind);
        const unavailable = new RecordingPackageResolver(() => {
            throw new Error("repository unavailable");
        });

        await expect(
            runIntegrationInstallation({
                mode: "rerun",
                deps: { sources: context.sources, secrets: context.secrets },
                installations: context.installations,
                integrationId: definition.kind,
                packageResolver: unavailable,
            }),
        ).rejects.toThrow("repository unavailable");

        const after = await context.installations.get(definition.kind);
        expect(after).toEqual(before);
    });
});

function create(
    context: ReturnType<typeof packageLifecycleContext>,
    definition: IntegrationDefinition,
    packageResolver?: RecordingPackageResolver,
    connectorDeployer?: CapturingConnectorDeployer,
) {
    return runIntegrationInstallation({
        mode: "create",
        deps: {
            sources: context.sources,
            secrets: context.secrets,
            ...(connectorDeployer ? { connectorDeployers: [connectorDeployer] } : {}),
        },
        installations: context.installations,
        siteIntegrations: [definition],
        dto: { kind: definition.kind, answers: { id: "rerun-source" }, options: {} },
        packageResolver,
    });
}
