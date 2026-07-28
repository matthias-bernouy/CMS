import type { Runner } from "@bernouy/http-runner";
import type { IntegrationPackageSource } from "@bernouy/cms-integration-packages";
import type { IntegrationDefinitionRepository } from "@bernouy/cms-integrations";
import { integrationCatalogApiRouteHandler } from "cms-repository/catalog/api/handler";
import type { RepositoryCatalogReader } from "cms-repository/catalog/contracts";
import type {
    RepositoryCompatibilityReader,
    RepositoryProjectedCompatibilityReader,
} from "cms-repository/compatibility/contracts";
import {
    integrationCompatibilityRouteHandler,
    integrationProjectedCompatibilityRouteHandler,
} from "cms-repository/compatibility/routes";
import type {
    RepositoryProjectedReleaseReader,
    RepositoryReleaseReader,
    RepositoryVerificationBundleReader,
} from "cms-repository/compatibility/releaseContracts";
import {
    integrationProjectedReleaseRouteHandler,
    integrationReleaseRouteHandler,
    integrationVerificationBundleRouteHandler,
} from "cms-repository/compatibility/releaseRoutes";
import { integrationPackageRouteHandlers } from "cms-repository/integrationPackageRoutes";
import {
    assertPackageDownloadProtection,
    type PublicPackageDownloadProtection,
} from "cms-repository/packageDownloadGuard";
import {
    publicBytesResponse,
    publicErrorResponse,
    publicHeadResponse,
    publicJsonResponse,
    publicNotFound,
    publicOptionsResponse,
} from "cms-repository/publicReadResponse";
import {
    observePublicRepositoryRead,
    type PublicRepositoryReadObserver,
    type PublicRepositoryReadResource,
} from "cms-repository/readObservation";

type RepositoryCmsBaseConfig = {
    runner: Runner;
    integrationCatalog: IntegrationDefinitionRepository;
    repositoryCatalog?: RepositoryCatalogReader;
    integrationCompatibility?: RepositoryCompatibilityReader;
    integrationProjectedCompatibility?: RepositoryProjectedCompatibilityReader;
    integrationReleases?: RepositoryReleaseReader;
    integrationProjectedReleases?: RepositoryProjectedReleaseReader;
    integrationVerificationBundles?: RepositoryVerificationBundleReader;
    observeRead?: PublicRepositoryReadObserver;
};

export type RepositoryCmsConfig = RepositoryCmsBaseConfig &
    (
        | { integrationPackages?: undefined; packageDownloadProtection?: undefined }
        | {
              integrationPackages: IntegrationPackageSource;
              packageDownloadProtection: PublicPackageDownloadProtection;
          }
    );

export class RepositoryCms {
    private readonly runner: Runner;
    private readonly integrationCatalog: IntegrationDefinitionRepository;
    private readonly integrationCompatibility?: RepositoryCompatibilityReader;
    private readonly repositoryCatalog?: RepositoryCatalogReader;
    private readonly integrationProjectedCompatibility?: RepositoryProjectedCompatibilityReader;
    private readonly integrationReleases?: RepositoryReleaseReader;
    private readonly integrationProjectedReleases?: RepositoryProjectedReleaseReader;
    private readonly integrationVerificationBundles?: RepositoryVerificationBundleReader;
    private readonly integrationPackages?: IntegrationPackageSource;
    private readonly packageDownloadProtection?: PublicPackageDownloadProtection;
    private readonly observeRead?: PublicRepositoryReadObserver;

    constructor(config: RepositoryCmsConfig) {
        this.runner = config.runner;
        this.integrationCatalog = config.integrationCatalog;
        this.repositoryCatalog = config.repositoryCatalog;
        this.integrationCompatibility = config.integrationCompatibility;
        this.integrationProjectedCompatibility = config.integrationProjectedCompatibility;
        this.integrationReleases = config.integrationReleases;
        this.integrationProjectedReleases = config.integrationProjectedReleases;
        this.integrationVerificationBundles = config.integrationVerificationBundles;
        this.integrationPackages = config.integrationPackages;
        this.packageDownloadProtection = config.packageDownloadProtection;
        this.observeRead = config.observeRead;
        if (this.integrationReleases && this.integrationProjectedReleases) {
            throw new TypeError("Repository release readers are mutually exclusive");
        }
        if (this.integrationCompatibility && this.integrationProjectedCompatibility) {
            throw new TypeError("Repository compatibility readers are mutually exclusive");
        }
        if (this.packageDownloadProtection) {
            assertPackageDownloadProtection(this.packageDownloadProtection);
        }
        this.registerRoutes();
    }

    get basePath(): string {
        const base = this.runner.basePath;
        return base === "/" ? "" : base;
    }

    private registerRoutes(): void {
        this.registerPublicRead("/api/integrations", "integrations", async (req) =>
            publicJsonResponse(req, await this.integrationCatalog.list(), "catalog"),
        );

        if (this.repositoryCatalog) {
            this.registerPublicRead(
                "/api/integrations/catalog",
                "integration-catalog",
                integrationCatalogApiRouteHandler(this.repositoryCatalog),
            );
        }

        this.registerPublicRead("/api/integrations/index", "integration-index", async (req) => {
            const kind = requiredSearchParam(req, "kind");
            const index = await this.integrationCatalog.getIndex(kind);
            return index ? publicJsonResponse(req, index, "catalog") : publicNotFound("integration not found");
        });

        this.registerPublicRead("/api/integrations/versions", "integration-versions", async (req) => {
            const kind = requiredSearchParam(req, "kind");
            const index = await this.integrationCatalog.getIndex(kind);
            if (!index) {
                return publicNotFound("integration not found");
            }
            return publicJsonResponse(req, index.versions, "catalog");
        });

        this.registerPublicRead("/api/integrations/definition", "integration-definition", async (req) => {
            const url = new URL(req.url);
            const kind = requiredSearchParam(req, "kind");
            const version = optionalText(url.searchParams.get("version"));
            const definition = await this.integrationCatalog.get(kind, version);
            return definition
                ? publicJsonResponse(req, definition, version ? "immutable" : "catalog")
                : publicNotFound("integration definition not found");
        });

        this.registerPublicRead("/api/integrations/asset", "integration-asset", async (req) => {
            const url = new URL(req.url);
            const kind = requiredSearchParam(req, "kind");
            const path = requiredSearchParam(req, "path");
            const version = optionalText(url.searchParams.get("version"));
            const asset = await this.integrationCatalog.getAsset?.(kind, version, path);
            if (!asset) {
                return publicNotFound("integration asset not found");
            }
            return publicBytesResponse(req, asset.bytes, version ? "immutable" : "catalog", asset.contentType);
        });

        if (this.integrationCompatibility) {
            this.registerPublicRead(
                "/api/integrations/compatibility",
                "integration-compatibility",
                integrationCompatibilityRouteHandler(this.integrationCompatibility),
            );
        }

        if (this.integrationProjectedCompatibility) {
            this.registerPublicRead(
                "/api/integrations/compatibility",
                "integration-compatibility",
                integrationProjectedCompatibilityRouteHandler(this.integrationProjectedCompatibility),
            );
        }

        if (this.integrationReleases) {
            this.registerPublicRead(
                "/api/integrations/release",
                "integration-release",
                integrationReleaseRouteHandler(this.integrationReleases),
            );
        }

        if (this.integrationProjectedReleases) {
            this.registerPublicRead(
                "/api/integrations/release",
                "integration-release",
                integrationProjectedReleaseRouteHandler(this.integrationProjectedReleases),
            );
        }

        if (this.integrationVerificationBundles) {
            this.registerPublicRead(
                "/api/integrations/verification-bundle",
                "integration-verification-bundle",
                integrationVerificationBundleRouteHandler(this.integrationVerificationBundles),
            );
        }

        if (this.integrationPackages && this.packageDownloadProtection) {
            const handlers = integrationPackageRouteHandlers(this.integrationPackages, this.packageDownloadProtection);
            this.registerPublicRead("/api/integrations/package", "integration-package", handlers.package);
            this.registerPublicRead(
                "/api/integrations/release-notes",
                "integration-release-notes",
                handlers.releaseNotes,
            );
        }
    }

    private registerPublicRead(
        path: string,
        resource: PublicRepositoryReadResource,
        handler: (request: Request) => Promise<Response>,
    ): void {
        const publicHandler = async (request: Request) => {
            const startedAt = performance.now();
            let status = 500;
            try {
                const response = await handler(request);
                status = response.status;
                return response;
            } catch (error) {
                const response = publicErrorResponse(error);
                status = response.status;
                return response;
            } finally {
                observePublicRepositoryRead(this.observeRead, {
                    resource,
                    method: request.method === "HEAD" ? "HEAD" : "GET",
                    status,
                    durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
                });
            }
        };
        this.runner.get(path, publicHandler);
        this.runner.addEndpoint("HEAD", path, async (request) => publicHeadResponse(await publicHandler(request)));
        this.runner.addEndpoint("OPTIONS", path, () => publicOptionsResponse());
    }
}

function requiredSearchParam(req: Request, name: string): string {
    const value = optionalText(new URL(req.url).searchParams.get(name));
    if (!value) {
        throw Object.assign(new Error(`Missing param ${name}`), { status: 400 });
    }
    return value;
}

function optionalText(value: string | null): string | undefined {
    return value && value.trim() ? value.trim() : undefined;
}
