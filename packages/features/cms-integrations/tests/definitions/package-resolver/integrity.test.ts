import { afterEach, describe, expect, test } from "bun:test";
import { FsIntegrationPackageCache } from "@bernouy/cms-integration-packages/fs";
import { FsIntegrationPackageResolver } from "@bernouy/cms-integrations/fs";
import { resolutionRequest, resolverPackageFixture } from "./packageFixture";
import { failingPackageSource, staticPackageSource } from "./sourceFixture";
import { cleanupResolverWorkspaces, temporaryResolverWorkspace } from "./workspaceFixture";

const cleanup: string[] = [];
afterEach(async () => await cleanupResolverWorkspaces(cleanup));

describe("filesystem integration package resolver integrity", () => {
    test("uses an installed digest and valid object without depending on a conflicting reference", async () => {
        const workspace = await temporaryResolverWorkspace(cleanup);
        const fixture = await resolverPackageFixture();
        const cache = new FsIntegrationPackageCache({ root: workspace.cacheRoot });
        await cache.recordReference("resolver-demo", "1.2.3", "a".repeat(64));
        await cache.materialize(fixture.package);
        const source = failingPackageSource(Object.assign(new Error("offline"), { status: 503 }));
        const resolver = new FsIntegrationPackageResolver({ cache, source });

        const resolved = await resolver.resolve(
            resolutionRequest(fixture, {
                expectedDigest: fixture.package.digest,
                expectedDefinition: fixture.definition,
                reason: "rerun",
            }),
        );

        expect(resolved.digest).toBe(fixture.package.digest);
        expect(source.calls).toEqual([]);
    });

    test("rejects remote bytes whose digest conflicts with the recorded reference", async () => {
        const workspace = await temporaryResolverWorkspace(cleanup);
        const referenced = await resolverPackageFixture({ label: "Referenced release" });
        const changed = await resolverPackageFixture({ label: "Changed release" });
        const cache = new FsIntegrationPackageCache({ root: workspace.cacheRoot });
        await cache.recordReference("resolver-demo", "1.2.3", referenced.package.digest);
        const source = staticPackageSource(changed.package);
        const resolver = new FsIntegrationPackageResolver({ cache, source });

        await expect(resolver.resolve(resolutionRequest(changed))).rejects.toMatchObject({ status: 502 });
        expect(source.calls).toHaveLength(1);
        expect(await cache.get(changed.package.digest)).toBeNull();
        expect(await cache.getReference("resolver-demo", "1.2.3")).toMatchObject({
            digest: referenced.package.digest,
        });
    });

    test("validates the definition snapshot before recording a new reference", async () => {
        const workspace = await temporaryResolverWorkspace(cleanup);
        const fixture = await resolverPackageFixture();
        const cache = new FsIntegrationPackageCache({ root: workspace.cacheRoot });
        const source = staticPackageSource(fixture.package);
        const resolver = new FsIntegrationPackageResolver({ cache, source });

        await expect(
            resolver.resolve(
                resolutionRequest(fixture, {
                    expectedDefinition: { ...fixture.definition, label: "Unexpected definition" },
                }),
            ),
        ).rejects.toMatchObject({ status: 502 });
        expect(await cache.get(fixture.package.digest)).not.toBeNull();
        expect(await cache.getReference("resolver-demo", "1.2.3")).toBeNull();
    });

    test("returns the installed snapshot as authority after package validation", async () => {
        const workspace = await temporaryResolverWorkspace(cleanup);
        const fixture = await resolverPackageFixture({
            inputs: [
                {
                    name: "apiKey",
                    label: "API key",
                    type: "password",
                    required: true,
                    secret: true,
                    defaultValue: "package-only-default",
                },
            ],
        });
        const snapshot = {
            ...fixture.definition,
            inputs: fixture.definition.inputs.map(({ defaultValue: _defaultValue, ...input }) => input),
        };
        const resolver = new FsIntegrationPackageResolver({
            cache: new FsIntegrationPackageCache({ root: workspace.cacheRoot }),
            source: staticPackageSource(fixture.package),
        });

        const resolved = await resolver.resolve(
            resolutionRequest(fixture, { reason: "rerun", expectedDefinition: snapshot }),
        );

        expect(resolved.definition).toEqual(snapshot);
        expect(resolved.definition.inputs[0]).not.toHaveProperty("defaultValue");
    });

    test("accepts a pre-schema legacy installation snapshot", async () => {
        const workspace = await temporaryResolverWorkspace(cleanup);
        const fixture = await resolverPackageFixture();
        const { schema: _schema, ...legacySnapshot } = fixture.definition;
        const resolver = new FsIntegrationPackageResolver({
            cache: new FsIntegrationPackageCache({ root: workspace.cacheRoot }),
            source: staticPackageSource(fixture.package),
        });

        const resolved = await resolver.resolve(
            resolutionRequest(fixture, { reason: "rerun", expectedDefinition: legacySnapshot }),
        );

        expect(resolved.definition).toEqual(legacySnapshot);
        expect(resolved.definition).not.toHaveProperty("schema");
    });
});
