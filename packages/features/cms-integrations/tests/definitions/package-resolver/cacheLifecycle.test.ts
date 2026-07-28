import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { FsIntegrationPackageCache } from "@bernouy/cms-integration-packages/fs";
import { FsIntegrationPackageResolver } from "@bernouy/cms-integrations/fs";
import { resolutionRequest, resolverPackageFixture } from "./packageFixture";
import { failingPackageSource, staticPackageSource } from "./sourceFixture";
import { cleanupResolverWorkspaces, temporaryResolverWorkspace, type ResolverWorkspace } from "./workspaceFixture";

const cleanup: string[] = [];
afterEach(async () => await cleanupResolverWorkspaces(cleanup));

describe("filesystem integration package resolver cache lifecycle", () => {
    test("constructs without touching storage or package sources", async () => {
        const workspace = await temporaryResolverWorkspace(cleanup);
        const source = failingPackageSource(new Error("source must stay idle"));
        const embedded = failingPackageSource(new Error("embedded source must stay idle"));

        const cache = new FsIntegrationPackageCache({ root: workspace.cacheRoot });
        new FsIntegrationPackageResolver({ cache, source, embeddedSource: embedded });

        expect(existsSync(workspace.cacheRoot)).toBe(false);
        expect(source.calls).toEqual([]);
        expect(embedded.calls).toEqual([]);
    });

    test("downloads, materializes, validates, and records the first exact resolution", async () => {
        const workspace = await temporaryResolverWorkspace(cleanup);
        const fixture = await resolverPackageFixture();
        const source = staticPackageSource(fixture.package);
        const cache = new FsIntegrationPackageCache({ root: workspace.cacheRoot });
        const resolver = new FsIntegrationPackageResolver({ cache, source });

        const resolved = await resolver.resolve(resolutionRequest(fixture));

        expect(source.calls).toEqual([{ kind: "resolver-demo", version: "1.2.3" }]);
        expect(resolved).toMatchObject({
            kind: "resolver-demo",
            version: "1.2.3",
            digest: fixture.package.digest,
            definition: fixture.definition,
        });
        expect(await readFile(`${resolved.root}/definition.json`, "utf8")).toContain('"resolver-demo"');
        expect(await cache.get(fixture.package.digest)).not.toBeNull();
        expect(await cache.getReference("resolver-demo", "1.2.3")).toMatchObject({
            digest: fixture.package.digest,
        });
    });

    test("restarts from an immutable reference and cached object without source work", async () => {
        const workspace = await temporaryResolverWorkspace(cleanup);
        const fixture = await resolverPackageFixture();
        await populate(workspace, fixture.package);
        const source = failingPackageSource(new Error("remote source must stay idle"));
        const restarted = new FsIntegrationPackageResolver({
            cache: new FsIntegrationPackageCache({ root: workspace.cacheRoot }),
            source,
        });

        const resolved = await restarted.resolve(resolutionRequest(fixture, { reason: "rerun" }));

        expect(resolved.digest).toBe(fixture.package.digest);
        expect(resolved.definition).toEqual(fixture.definition);
        expect(source.calls).toEqual([]);
    });

    test("repairs a corrupt pinned object from its exact remote digest", async () => {
        const workspace = await temporaryResolverWorkspace(cleanup);
        const fixture = await resolverPackageFixture();
        const initial = await populate(workspace, fixture.package);
        const definitionPath = `${initial.root}/definition.json`;
        const referencePath = `${workspace.cacheRoot}/refs/resolver-demo/1.2.3.json`;
        await chmod(definitionPath, 0o640);
        await writeFile(definitionPath, "corrupt\n");
        await chmod(referencePath, 0o640);
        await writeFile(referencePath, "corrupt\n");
        const source = staticPackageSource(fixture.package);
        const restarted = new FsIntegrationPackageResolver({
            cache: new FsIntegrationPackageCache({ root: workspace.cacheRoot }),
            source,
        });

        const repaired = await restarted.resolve(
            resolutionRequest(fixture, {
                reason: "rerun",
                expectedDigest: fixture.package.digest,
                expectedDefinition: fixture.definition,
                allowEmbeddedFallback: true,
            }),
        );

        expect(source.calls).toHaveLength(1);
        expect(await readFile(`${repaired.root}/definition.json`, "utf8")).toContain('"resolver-demo"');
        expect(
            (
                await restarted.resolve(
                    resolutionRequest(fixture, {
                        reason: "rerun",
                        expectedDigest: fixture.package.digest,
                        expectedDefinition: fixture.definition,
                    }),
                )
            ).digest,
        ).toBe(fixture.package.digest);
        expect(source.calls).toHaveLength(1);
    });
});

async function populate(
    workspace: ResolverWorkspace,
    input: Awaited<ReturnType<typeof resolverPackageFixture>>["package"],
) {
    const cache = new FsIntegrationPackageCache({ root: workspace.cacheRoot });
    const resolver = new FsIntegrationPackageResolver({ cache, source: staticPackageSource(input) });
    return await resolver.resolve({
        kind: input.envelope.kind,
        version: input.envelope.version,
        reason: "create",
        allowEmbeddedFallback: false,
    });
}
