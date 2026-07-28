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
    test("selects the required repository URL for definitions and exact packages without fetching", async () => {
        const cacheRoot = await temporaryCacheRoot();
        const packageFetch = mock(async () => {
            throw new Error("composition must not fetch packages");
        });
        const services = createServices(cacheRoot, packageFetch as unknown as typeof fetch);

        expect(definitionBaseUrl(services.integrationCatalog)).toBe("https://integrations.example.test/catalog");
        expect(packageEndpoint(services.integrationPackageSource)).toBe(
            "https://integrations.example.test/catalog/api/integrations/package",
        );
        expect(cacheConfigRoot(services.integrationPackageCache)).toBe(cacheRoot);
        expect(resolverConfig(services.integrationPackageResolver)).toEqual({
            cache: services.integrationPackageCache,
            source: services.integrationPackageSource,
        });

        await services.integrationPackageCache.init();
        expect(packageFetch).toHaveBeenCalledTimes(0);
    });

    test("cleans abandoned staging and never falls back to an embedded package", async () => {
        const cacheRoot = await temporaryCacheRoot();
        const abandoned = join(cacheRoot, ".staging", "abandoned");
        await mkdir(abandoned, { recursive: true });
        await utimes(abandoned, new Date(0), new Date(0));
        const firstFetch = mock(async () => {
            throw new Error("repository unavailable");
        });
        const first = createServices(cacheRoot, firstFetch as unknown as typeof fetch);

        await first.integrationPackageCache.init();
        expect(firstFetch).toHaveBeenCalledTimes(0);
        await expect(stat(abandoned)).rejects.toMatchObject({ code: "ENOENT" });

        await expect(
            first.integrationPackageResolver.resolve({
                kind: "commerce",
                version: "1.0.0",
                reason: "rerun",
                allowEmbeddedFallback: true,
            }),
        ).rejects.toThrow("Integration repository is unavailable");
        expect(firstFetch).toHaveBeenCalledTimes(1);
    });
});

function createServices(cacheRoot: string, packageFetch?: typeof fetch) {
    return createProductionIntegrationServices({
        providerRepository: {} as never,
        secrets: {} as never,
        repository: { url: "https://integrations.example.test/catalog" },
        packageCacheDir: cacheRoot,
        packageFetch,
        environment: {},
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
