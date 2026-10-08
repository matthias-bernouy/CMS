import type { PublicAuthRoutesConfig } from "@bernouy/cms-auth/http";
import type { BlobStore } from "@bernouy/blob-store";
import type { ContentReader } from "@bernouy/cms-content/rendering";
import type { GatewayInvoker } from "@bernouy/cms-gateway";
import { BunRunner, type Cache, type Runner, TtlCache } from "@bernouy/http-runner";
import type { DeliveryCmsConfig } from "cms-delivery/interfaces/DeliveryCmsConfig";
import type { HeadInjector } from "cms-delivery/interfaces/HeadInjector";
import type { PublicPageProvider } from "cms-delivery/interfaces/PublicPageProvider";

export class DeliveryCmsContext {
    private readonly config: DeliveryCmsConfig;
    private readonly resolvedRunner: Runner;
    private readonly resolvedCache: Cache;

    constructor(config: DeliveryCmsConfig) {
        this.config = config;
        this.resolvedRunner = config.runner ?? new BunRunner();
        this.resolvedCache = config.cache ?? new TtlCache({ bypass: process.env.MODE === "DEV" });
    }

    get runner(): Runner {
        return this.resolvedRunner;
    }

    get repository(): ContentReader {
        return this.config.repository;
    }

    get cache(): Cache {
        return this.resolvedCache;
    }

    get maintenance(): DeliveryCmsConfig["maintenance"] {
        return this.config.maintenance;
    }

    get headInjectors(): readonly HeadInjector[] {
        return this.config.headInjectors ?? [];
    }

    get collectionTexts(): DeliveryCmsConfig["collectionTexts"] {
        return this.config.collectionTexts;
    }

    get collectionAssets(): DeliveryCmsConfig["collectionAssets"] {
        return this.config.collectionAssets;
    }

    get publicPageProviders(): readonly PublicPageProvider[] {
        return this.config.publicPageProviders ?? [];
    }

    get capabilityGateway(): DeliveryCmsConfig["capabilityGateway"] {
        return this.config.capabilityGateway;
    }

    get auth(): PublicAuthRoutesConfig | undefined {
        return this.config.auth;
    }

    get sitemapStore(): BlobStore {
        if (!this.config.sitemapStore) {
            throw new Error("sitemap storage backend not configured");
        }
        return this.config.sitemapStore;
    }

    get sitemapStoreOrNull(): BlobStore | null {
        return this.config.sitemapStore ?? null;
    }

    get basePath(): string {
        return this.resolvedRunner.basePath === "/" ? "" : this.resolvedRunner.basePath;
    }

    get cmsPathPrefix(): string {
        return this.basePath + "/.cms";
    }
}
