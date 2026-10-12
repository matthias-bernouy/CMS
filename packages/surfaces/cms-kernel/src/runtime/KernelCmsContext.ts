import type { BlobStore } from "@bernouy/blob-store";
import type { Authentication } from "@bernouy/cms-auth";
import type { CmsRepository } from "@bernouy/cms-content/kernel";
import { createContentReader, type ContentReader } from "@bernouy/cms-content/rendering";
import { BunRunner, type Cache, type Runner, TtlCache } from "@bernouy/http-runner";
import type { KernelCmsConfig } from "cms-kernel/interfaces/KernelCmsConfig";
import type { PublicPageProvider } from "cms-kernel/interfaces/PublicPageProvider";

export class KernelCmsContext {
    private readonly config: KernelCmsConfig;
    private readonly resolvedRunner: Runner;
    private readonly resolvedCache: Cache;
    private readonly resolvedContent: ContentReader;

    constructor(config: KernelCmsConfig) {
        this.config = config;
        this.resolvedRunner = config.runner ?? new BunRunner();
        this.resolvedCache = config.cache ?? new TtlCache({ bypass: process.env.MODE === "DEV" });
        this.resolvedContent = createContentReader(config.repository);
    }

    get runner(): Runner {
        return this.resolvedRunner;
    }

    get repository(): ContentReader {
        return this.resolvedContent;
    }

    get cmsRepository(): CmsRepository {
        return this.config.repository;
    }

    get cache(): Cache {
        return this.resolvedCache;
    }

    get collections(): KernelCmsConfig["collections"] {
        return this.config.collections;
    }

    get collectionAssets(): KernelCmsConfig["collectionAssets"] {
        return this.config.collectionAssets;
    }

    get publicPageProviders(): readonly PublicPageProvider[] {
        return this.config.publicPageProviders ?? [];
    }

    get capabilityGateway(): KernelCmsConfig["capabilityGateway"] {
        return this.config.capabilityGateway;
    }

    get authentication(): Authentication {
        return this.config.authentication;
    }

    get publicAuth(): KernelCmsConfig["publicAuth"] {
        return this.config.publicAuth;
    }

    get authBackends(): KernelCmsConfig["authBackends"] {
        return this.config.authBackends;
    }

    get identityProviders(): KernelCmsConfig["identityProviders"] {
        return this.config.identityProviders;
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
