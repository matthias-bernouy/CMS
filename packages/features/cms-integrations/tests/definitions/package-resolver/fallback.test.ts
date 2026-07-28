import { afterEach, describe, expect, test } from "bun:test";
import { FsIntegrationPackageCache } from "@bernouy/cms-integration-packages/fs";
import { FsIntegrationPackageResolver } from "@bernouy/cms-integrations/fs";
import { resolutionRequest, resolverPackageFixture } from "./packageFixture";
import {
    directoryPackageSource,
    failingPackageSource,
    repositoryStatusError,
    staticPackageSource,
} from "./sourceFixture";
import { cleanupResolverWorkspaces, temporaryResolverWorkspace, writePackageDirectory } from "./workspaceFixture";

const cleanup: string[] = [];
afterEach(async () => await cleanupResolverWorkspaces(cleanup));

describe("filesystem integration package resolver fallback policy", () => {
    test.each(["create", "upgrade"] as const)("never lets a %s use the legacy embedded fallback", async (reason) => {
        const workspace = await temporaryResolverWorkspace(cleanup);
        const fixture = await resolverPackageFixture();
        const source = staticPackageSource(null);
        const embedded = staticPackageSource(fixture.package);
        const resolver = new FsIntegrationPackageResolver({
            cache: new FsIntegrationPackageCache({ root: workspace.cacheRoot }),
            source,
            embeddedSource: embedded,
        });

        await expect(
            resolver.resolve(resolutionRequest(fixture, { reason, allowEmbeddedFallback: true })),
        ).rejects.toMatchObject({ status: 404, publicCode: "integration_package_not_found" });
        expect(source.calls).toHaveLength(1);
        expect(embedded.calls).toEqual([]);
    });

    test("never falls back to embedded content when a pinned remote is unavailable", async () => {
        const workspace = await temporaryResolverWorkspace(cleanup);
        const fixture = await resolverPackageFixture();
        const unavailable = repositoryStatusError(503);
        const source = failingPackageSource(unavailable);
        const embedded = staticPackageSource(fixture.package);
        const resolver = new FsIntegrationPackageResolver({
            cache: new FsIntegrationPackageCache({ root: workspace.cacheRoot }),
            source,
            embeddedSource: embedded,
        });

        await expect(
            resolver.resolve(
                resolutionRequest(fixture, {
                    reason: "rerun",
                    expectedDigest: fixture.package.digest,
                    expectedDefinition: fixture.definition,
                    allowEmbeddedFallback: true,
                }),
            ),
        ).rejects.toBe(unavailable);
        expect(source.calls).toHaveLength(1);
        expect(embedded.calls).toEqual([]);
    });

    test.each([
        ["503 response", repositoryStatusError(503)],
        ["404 result", null],
    ] as const)("lets a legacy exact installation use embedded content after a %s", async (_label, response) => {
        const workspace = await temporaryResolverWorkspace(cleanup);
        const fixture = await resolverPackageFixture();
        const packageRoot = await writePackageDirectory(workspace, fixture.package);
        const source = response ? failingPackageSource(response) : staticPackageSource(null);
        const embedded = directoryPackageSource(packageRoot, fixture.package);
        const cache = new FsIntegrationPackageCache({ root: workspace.cacheRoot });
        const resolver = new FsIntegrationPackageResolver({ cache, source, embeddedSource: embedded });

        const resolved = await resolver.resolve(
            resolutionRequest(fixture, {
                reason: "rerun",
                expectedDefinition: fixture.definition,
                allowEmbeddedFallback: true,
            }),
        );

        expect(resolved.digest).toBe(fixture.package.digest);
        expect(source.calls).toHaveLength(1);
        expect(embedded.calls).toHaveLength(1);
        expect(await cache.getReference("resolver-demo", "1.2.3")).toMatchObject({
            digest: fixture.package.digest,
        });
    });

    test("does not hide a remote contract failure behind embedded content", async () => {
        const workspace = await temporaryResolverWorkspace(cleanup);
        const fixture = await resolverPackageFixture();
        const invalid = repositoryStatusError(502);
        const source = failingPackageSource(invalid);
        const embedded = staticPackageSource(fixture.package);
        const resolver = new FsIntegrationPackageResolver({
            cache: new FsIntegrationPackageCache({ root: workspace.cacheRoot }),
            source,
            embeddedSource: embedded,
        });

        await expect(
            resolver.resolve(
                resolutionRequest(fixture, {
                    reason: "rerun",
                    expectedDefinition: fixture.definition,
                    allowEmbeddedFallback: true,
                }),
            ),
        ).rejects.toBe(invalid);
        expect(source.calls).toHaveLength(1);
        expect(embedded.calls).toEqual([]);
    });
});
