import type { Runner } from "@bernouy/http-runner";
import type { IntegrationPackageSource } from "@bernouy/cms-integration-packages";
import type { IntegrationDefinitionRepository } from "@bernouy/cms-integrations";
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

type RepositoryCmsBaseConfig = {
    runner: Runner;
    integrationCatalog: IntegrationDefinitionRepository;
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
    private readonly integrationPackages?: IntegrationPackageSource;
    private readonly packageDownloadProtection?: PublicPackageDownloadProtection;

    constructor(config: RepositoryCmsConfig) {
        this.runner = config.runner;
        this.integrationCatalog = config.integrationCatalog;
        this.integrationPackages = config.integrationPackages;
        this.packageDownloadProtection = config.packageDownloadProtection;
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
        this.registerPublicRead("/api/integrations", async (req) =>
            publicJsonResponse(req, await this.integrationCatalog.list(), "catalog"),
        );

        this.registerPublicRead("/api/integrations/index", async (req) => {
            const kind = requiredSearchParam(req, "kind");
            const index = await this.integrationCatalog.getIndex(kind);
            return index ? publicJsonResponse(req, index, "catalog") : publicNotFound("integration not found");
        });

        this.registerPublicRead("/api/integrations/versions", async (req) => {
            const kind = requiredSearchParam(req, "kind");
            const index = await this.integrationCatalog.getIndex(kind);
            if (!index) {
                return publicNotFound("integration not found");
            }
            return publicJsonResponse(req, index.versions, "catalog");
        });

        this.registerPublicRead("/api/integrations/definition", async (req) => {
            const url = new URL(req.url);
            const kind = requiredSearchParam(req, "kind");
            const version = optionalText(url.searchParams.get("version"));
            const definition = await this.integrationCatalog.get(kind, version);
            return definition
                ? publicJsonResponse(req, definition, version ? "immutable" : "catalog")
                : publicNotFound("integration definition not found");
        });

        this.registerPublicRead("/api/integrations/asset", async (req) => {
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

        if (this.integrationPackages && this.packageDownloadProtection) {
            const handlers = integrationPackageRouteHandlers(this.integrationPackages, this.packageDownloadProtection);
            this.registerPublicRead("/api/integrations/package", handlers.package);
            this.registerPublicRead("/api/integrations/release-notes", handlers.releaseNotes);
        }
    }

    private registerPublicRead(path: string, handler: (request: Request) => Promise<Response>): void {
        const publicHandler = async (request: Request) => {
            try {
                return await handler(request);
            } catch (error) {
                return publicErrorResponse(error);
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
