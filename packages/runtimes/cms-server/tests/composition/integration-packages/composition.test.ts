import { afterEach, describe, expect, mock, test } from "bun:test";
import { chmod, lstat, mkdir, mkdtemp, opendir, rm, stat, unlink, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IntegrationPackageSource } from "@bernouy/cms-integration-packages";
import type { FsIntegrationPackageCache } from "@bernouy/cms-integration-packages/fs";
import type { IntegrationDefinitionRepository, IntegrationPackageResolver } from "@bernouy/cms-integrations";
import { createProductionIntegrationServices } from "../../../src/runtime/integrations";

const cleanup: string[] = [];

afterEach(async () => {
    await Promise.all(
        cleanup.splice(0).map(async (path) => {
            await makeOwnerWritable(path);
            await rm(path, { recursive: true, force: true });
        }),
    );
});

describe("production integration package resolver composition", () => {
    test.each([
        ["remote", "  https://integrations.example.test/catalog  ", "https://integrations.example.test/catalog"],
        ["Delivery loopback", "  ", "http://127.0.0.1:3001/.cms/repository"],
    ])(
        "selects the %s URL for both definitions and exact packages without fetching",
        async (_, configured, expected) => {
            const cacheRoot = await temporaryCacheRoot();
            const packageFetch = mock(async () => {
                throw new Error("composition must not fetch packages");
            });
            const services = createServices(cacheRoot, configured, packageFetch as unknown as typeof fetch);

            expect(definitionBaseUrl(services.integrationCatalog)).toBe(expected);
            expect(packageEndpoint(services.integrationPackageSource)).toBe(`${expected}/api/integrations/package`);
            expect(cacheConfigRoot(services.integrationPackageCache)).toBe(cacheRoot);
            expect(resolverConfig(services.integrationPackageResolver)).toEqual({
                cache: services.integrationPackageCache,
                source: services.integrationPackageSource,
                embeddedSource: services.integrationRepositoryPackages,
            });

            await services.integrationPackageCache.init();
            expect(packageFetch).toHaveBeenCalledTimes(0);
        },
    );

    test("cleans abandoned staging and reuses a materialized package after restart while offline", async () => {
        const cacheRoot = await temporaryCacheRoot();
        const abandoned = join(cacheRoot, ".staging", "abandoned");
        await mkdir(abandoned, { recursive: true });
        await utimes(abandoned, new Date(0), new Date(0));
        const firstFetch = mock(async () => {
            throw new Error("repository unavailable");
        });
        const first = createServices(cacheRoot, undefined, firstFetch as unknown as typeof fetch);

        await first.integrationPackageCache.init();
        expect(firstFetch).toHaveBeenCalledTimes(0);
        await expect(stat(abandoned)).rejects.toMatchObject({ code: "ENOENT" });

        const materialized = await first.integrationPackageResolver.resolve({
            kind: "commerce-mondial-relay-delivery",
            version: "1.0.0",
            reason: "rerun",
            allowEmbeddedFallback: true,
        });
        expect(firstFetch).toHaveBeenCalledTimes(1);
        expect(materialized).toMatchObject({ kind: "commerce-mondial-relay-delivery", version: "1.0.0" });

        const restartedFetch = mock(async () => {
            throw new Error("restarted runtime must use its durable cache");
        });
        const restarted = createServices(cacheRoot, undefined, restartedFetch as unknown as typeof fetch);
        await restarted.integrationPackageCache.init();
        const cached = await restarted.integrationPackageResolver.resolve({
            kind: "commerce-mondial-relay-delivery",
            version: "1.0.0",
            reason: "rerun",
            allowEmbeddedFallback: true,
        });

        expect(cached.digest).toBe(materialized.digest);
        expect(cached.root).toBe(materialized.root);
        expect(restartedFetch).toHaveBeenCalledTimes(0);
    });
});

function createServices(cacheRoot: string, configuredUrl?: string, packageFetch?: typeof fetch) {
    return createProductionIntegrationServices({
        providerRepository: {} as never,
        secrets: {} as never,
        localRepositoryUrl: "http://127.0.0.1:3001/.cms/repository",
        packageCacheDir: cacheRoot,
        packageFetch,
        environment: configuredUrl === undefined ? {} : { P9R_INTEGRATION_REPOSITORY_URL: configuredUrl },
    });
}

async function temporaryCacheRoot(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "cms-runtime-package-cache-"));
    cleanup.push(root);
    return root;
}

function definitionBaseUrl(repository: IntegrationDefinitionRepository): string {
    return (repository as unknown as { baseUrl: string }).baseUrl;
}

function packageEndpoint(source: IntegrationPackageSource): string {
    return (source as unknown as { endpoint: URL }).endpoint.href;
}

function cacheConfigRoot(cache: FsIntegrationPackageCache): string {
    return (cache as unknown as { config: { root: string } }).config.root;
}

function resolverConfig(resolver: IntegrationPackageResolver): Record<string, unknown> {
    return (resolver as unknown as { config: Record<string, unknown> }).config;
}

async function makeOwnerWritable(path: string): Promise<void> {
    const metadata = await lstat(path);
    if (metadata.isSymbolicLink()) {
        await unlink(path);
        return;
    }
    await chmod(path, metadata.isDirectory() ? 0o700 : 0o600);
    if (!metadata.isDirectory()) {
        return;
    }
    const directory = await opendir(path);
    for await (const entry of directory) {
        await makeOwnerWritable(join(path, entry.name));
    }
}
