import { createHash } from "node:crypto";
import type { TPage } from "@bernouy/cms-content";
import { IntegrationPackageValidationError } from "@bernouy/cms-integration-packages";
import { IntegrationRepositoryError } from "@bernouy/cms-integrations";
import type {
    RepositoryCatalogPageRequestContext,
    RepositoryCatalogPageResolution,
    RepositoryCatalogReader,
} from "./contracts";
import { renderRepositoryIntegration } from "./render/integration";
import { renderRepositoryCatalogList } from "./render/list";
import { renderRepositoryVersion } from "./render/version";
import {
    parseRepositoryCatalogRoute,
    REPOSITORY_CATALOG_ROOT,
    repositoryIntegrationPath,
    repositoryVersionPath,
} from "./routes";
import {
    assertCatalogListDocument,
    assertIntegrationPageDocument,
    assertVersionPageDocument,
} from "./validation/catalogData";
import { REPOSITORY_CATALOG_LIMITS, RepositoryCatalogDataError } from "./validation/limits";
import { buildRepositoryCatalogListView } from "./view/list";

export class RepositoryCatalogPageProvider {
    constructor(private readonly reader: RepositoryCatalogReader) {}

    async resolvePage(
        pathname: string,
        context: RepositoryCatalogPageRequestContext,
    ): Promise<RepositoryCatalogPageResolution | null> {
        const route = parseRepositoryCatalogRoute(pathname);
        if (!route) {
            return null;
        }
        try {
            if (route.page === "list") {
                const document = await this.reader.listIntegrations();
                assertCatalogListDocument(document);
                return resolution(
                    page(
                        "repository-catalog",
                        pathname,
                        "Integration catalog",
                        "Browse published integrations.",
                        renderRepositoryCatalogList(buildRepositoryCatalogListView(document.value, context)),
                    ),
                    route.page,
                    document.revision,
                );
            }
            if (route.page === "integration") {
                const document = await this.reader.getIntegration(route.kind);
                if (!document) {
                    return null;
                }
                assertIntegrationPageDocument(document, route.kind);
                return resolution(
                    page(
                        `repository-integration:${route.kind}`,
                        pathname,
                        `${document.value.integration.label} integration`,
                        document.value.integration.description ?? "Published integration versions and package details.",
                        renderRepositoryIntegration(document.value),
                    ),
                    route.page,
                    document.revision,
                );
            }
            const document = await this.reader.getVersion(route.kind, route.version);
            if (!document) {
                return null;
            }
            assertVersionPageDocument(document, route.kind, route.version);
            return resolution(
                page(
                    `repository-version:${route.kind}:${route.version}`,
                    pathname,
                    `${document.value.integration.label} ${route.version}`,
                    document.value.version.definition.description ?? "Immutable integration package version.",
                    renderRepositoryVersion(document.value),
                ),
                route.page,
                document.revision,
            );
        } catch (error) {
            if (
                error instanceof IntegrationRepositoryError ||
                error instanceof IntegrationPackageValidationError ||
                error instanceof RepositoryCatalogDataError
            ) {
                return repositoryErrorPage(pathname, error instanceof IntegrationRepositoryError ? error.status : 502);
            }
            throw error;
        }
    }

    async listSitemapPaths(): Promise<readonly string[]> {
        try {
            const document = await this.reader.listIntegrations();
            assertCatalogListDocument(document);
            const paths = new Set<string>([REPOSITORY_CATALOG_ROOT]);
            for (const integration of document.value) {
                paths.add(repositoryIntegrationPath(integration.kind));
                for (const { version } of integration.versions) {
                    paths.add(repositoryVersionPath(integration.kind, version));
                    if (paths.size > REPOSITORY_CATALOG_LIMITS.sitemapPaths) {
                        throw new RepositoryCatalogDataError("Repository catalog sitemap limit exceeded");
                    }
                }
            }
            return [...paths].sort((left, right) => left.localeCompare(right));
        } catch (error) {
            if (
                error instanceof IntegrationRepositoryError ||
                error instanceof IntegrationPackageValidationError ||
                error instanceof RepositoryCatalogDataError
            ) {
                return [REPOSITORY_CATALOG_ROOT];
            }
            throw error;
        }
    }
}

function resolution(pageValue: TPage, route: string, revision: string): RepositoryCatalogPageResolution {
    const cacheIdentity = createHash("sha256").update(`${route}\0${revision}`).digest("hex");
    return { page: pageValue, cacheIdentity };
}

function repositoryErrorPage(pathname: string, status: number): RepositoryCatalogPageResolution {
    const safeStatus = status === 503 ? 503 : 502;
    const message =
        safeStatus === 503
            ? "The repository could not be reached. Other CMS pages remain available. Please try again later."
            : "The repository returned catalog data that could not be displayed.";
    return {
        page: page(
            "repository-catalog-unavailable",
            pathname,
            "Integration catalog unavailable",
            "The integration catalog is temporarily unavailable.",
            `<main class="repository-catalog repository-error"><h1>Integration catalog unavailable</h1><p>${message}</p></main>`,
        ),
        status: safeStatus,
    };
}

function page(id: string, path: string, title: string, description: string, content: string): TPage {
    return { id, path, title, description, content, visible: true, tags: ["integrations", "repository"] };
}
