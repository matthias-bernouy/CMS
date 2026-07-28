import { afterEach, describe, expect, mock, test } from "bun:test";
import { mkdtemp, realpath, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IntegrationPackageSource } from "@bernouy/cms-integration-packages";
import type { FsIntegrationPackageCache } from "@bernouy/cms-integration-packages/fs";
import type { IntegrationDefinitionRepository, IntegrationPackageResolver } from "@bernouy/cms-integrations";
import {
    createLocalIntegrationServices,
    INTEGRATION_REPOSITORY_URL_ENV,
    LOCAL_INTEGRATION_PACKAGE_CACHE_PATH,
    readIntegrationRepositoryUrl,
} from "../../../src/commands/dev/integrations";

const cleanup: string[] = [];

afterEach(async () => {
    await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("local integration package resolver composition", () => {
    test("uses the configured repository without network I/O at startup", async () => {
        const siteDir = await temporarySite();
        const repositoryUrl = "https://integrations.example.test/catalog";
        const definitionFetch = mock(async () => {
            throw new Error("local service startup must not fetch definitions");
        });
        const packageFetch = mock(async () => {
            throw new Error("local service startup must not fetch packages");
        });
        const services = await createLocalIntegrationServices(siteDir, repositoryUrl, {} as never, {
            definitionFetch: definitionFetch as unknown as typeof fetch,
            packageFetch: packageFetch as unknown as typeof fetch,
        });
        const expectedCacheRoot = join(siteDir, ".p9r", "integration-packages");

        expect(LOCAL_INTEGRATION_PACKAGE_CACHE_PATH).toBe(".p9r/integration-packages");
        expect(definitionBaseUrl(services.integrationCatalog)).toBe(repositoryUrl);
        expect(packageEndpoint(services.integrationPackageSource)).toBe(`${repositoryUrl}/api/integrations/package`);
        expect(cacheConfigRoot(services.integrationPackageCache)).toBe(expectedCacheRoot);
        expect(await realpath(expectedCacheRoot)).toBe(expectedCacheRoot);
        expect((await stat(join(expectedCacheRoot, ".staging"))).isDirectory()).toBeTrue();
        expect(resolverConfig(services.integrationPackageResolver)).toEqual({
            cache: services.integrationPackageCache,
            source: services.integrationPackageSource,
        });
        expect(packageFetch).toHaveBeenCalledTimes(0);
        expect(definitionFetch).toHaveBeenCalledTimes(0);
    });
});

describe("local integration repository configuration", () => {
    test("requires one repository and normalizes its trailing slash", () => {
        expect(
            readIntegrationRepositoryUrl({
                [INTEGRATION_REPOSITORY_URL_ENV]: "  https://repository.example/.cms/repository/  ",
            }),
        ).toBe("https://repository.example/.cms/repository");
        expect(() => readIntegrationRepositoryUrl({})).toThrow(
            "P9R_INTEGRATION_REPOSITORY_URL is required for p9r dev and p9r preview",
        );
        expect(() => readIntegrationRepositoryUrl({ P9R_INTEGRATION_REPOSITORY_URL: "  " })).toThrow(
            "P9R_INTEGRATION_REPOSITORY_URL is required for p9r dev and p9r preview",
        );
    });

    test.each([
        "relative/repository",
        "ftp://repository.example/.cms/repository",
        "https://user:secret@repository.example/.cms/repository",
        "https://repository.example/.cms/repository?tenant=one",
        "https://repository.example/.cms/repository#catalog",
    ])("rejects an unsafe repository URL: %s", (configured) => {
        expect(() => readIntegrationRepositoryUrl({ P9R_INTEGRATION_REPOSITORY_URL: configured })).toThrow(
            /P9R_INTEGRATION_REPOSITORY_URL must be an absolute HTTP\(S\) URL/,
        );
    });
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
