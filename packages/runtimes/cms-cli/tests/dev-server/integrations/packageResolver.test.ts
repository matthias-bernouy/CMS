import { afterEach, describe, expect, mock, test } from "bun:test";
import { mkdtemp, realpath, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IntegrationPackageSource } from "@bernouy/cms-integration-packages";
import type { FsIntegrationPackageCache } from "@bernouy/cms-integration-packages/fs";
import type { IntegrationDefinitionRepository, IntegrationPackageResolver } from "@bernouy/cms-integrations";
import {
    createLocalIntegrationServices,
    LOCAL_INTEGRATION_PACKAGE_CACHE_PATH,
} from "../../../src/commands/dev/integrations";

const cleanup: string[] = [];

afterEach(async () => {
    await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("local integration package resolver composition", () => {
    test.each([
        [
            "remote",
            "  https://integrations.example.test/catalog  ",
            "https://integrations.example.test/catalog",
            "global",
        ],
        ["Delivery loopback", " ", "http://localhost:5001/.cms/repository", "embedded"],
    ])(
        "uses the %s URL for definitions and packages without network I/O at startup",
        async (_, configured, expected, readMode) => {
            const siteDir = await temporarySite();
            const definitionFetch = mock(async () => {
                throw new Error("local service startup must not fetch definitions");
            });
            const packageFetch = mock(async () => {
                throw new Error("local service startup must not fetch packages");
            });
            const services = await createLocalIntegrationServices(
                siteDir,
                "http://localhost:5001/.cms/repository",
                {} as never,
                {
                    environment: { P9R_INTEGRATION_REPOSITORY_URL: configured },
                    definitionFetch: definitionFetch as unknown as typeof fetch,
                    packageFetch: packageFetch as unknown as typeof fetch,
                },
            );
            const expectedCacheRoot = join(siteDir, ".p9r", "integration-packages");

            expect(LOCAL_INTEGRATION_PACKAGE_CACHE_PATH).toBe(".p9r/integration-packages");
            expect(services.repositoryReadMode).toBe(readMode);
            expect(definitionBaseUrl(services.integrationCatalog)).toBe(expected);
            expect(packageEndpoint(services.integrationPackageSource)).toBe(`${expected}/api/integrations/package`);
            expect(cacheConfigRoot(services.integrationPackageCache)).toBe(expectedCacheRoot);
            expect(await realpath(expectedCacheRoot)).toBe(expectedCacheRoot);
            expect((await stat(join(expectedCacheRoot, ".staging"))).isDirectory()).toBeTrue();
            expect(resolverConfig(services.integrationPackageResolver)).toEqual({
                cache: services.integrationPackageCache,
                source: services.integrationPackageSource,
                embeddedSource: services.integrationRepositoryPackages,
            });
            expect(packageFetch).toHaveBeenCalledTimes(0);
            expect(definitionFetch).toHaveBeenCalledTimes(0);
            if (readMode === "global") {
                expect(services.publicRepositoryCatalog).toBe(services.integrationCatalog);
                expect(services.publicRepositoryPackages).toBe(services.integrationPackageSource);
            } else {
                expect(services.publicRepositoryCatalog).toBe(services.integrationRepositoryCatalog);
                expect(services.publicRepositoryPackages).toBe(services.integrationRepositoryPackages);
            }
        },
    );
});

async function temporarySite(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "p9r-package-cache-"));
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
