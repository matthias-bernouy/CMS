import { mountKernelRoutes } from "cms-kernel/http/mountKernelRoutes";
import type { KernelCmsConfig } from "cms-kernel/KernelCmsConfig";
import { mountAuthRoutes } from "cms-kernel/http/auth/mountAuthRoutes";
import type { ContentReader } from "@bernouy/cms-content/rendering";
import type { BlobStore } from "@bernouy/blob-store";
import type { Logger } from "@bernouy/logging";

export type { KernelCmsConfig } from "cms-kernel/KernelCmsConfig";

export default class KernelCms {
    readonly runner;
    readonly cache;
    readonly content: ContentReader;
    readonly authentication;
    readonly publicAuth;
    readonly localAuthentication;
    readonly collections;
    readonly collectionAssets;
    readonly capabilityGateway;
    readonly pageCapabilities;
    readonly capabilityHandler;
    readonly queryHandler;
    readonly collectionAssetHandler;
    readonly sitemapHandler;
    readonly sitemapChunkHandler;
    readonly sitemapStore?: BlobStore;
    readonly enforcePageCsp: boolean;
    readonly basePath: string;
    readonly cmsPathPrefix: string;
    readonly logger: Logger;

    constructor(config: KernelCmsConfig) {
        this.runner = config.runner;
        this.cache = config.cache;
        this.content = config.content;
        this.authentication = config.authentication;
        this.publicAuth = config.publicAuth;
        this.localAuthentication = config.localAuthentication;
        this.collections = config.collections;
        this.collectionAssets = config.collectionAssets;
        this.capabilityGateway = config.capabilityGateway;
        this.pageCapabilities = config.pageCapabilities;
        this.capabilityHandler = config.capabilityHandler;
        this.queryHandler = config.queryHandler;
        this.collectionAssetHandler = config.collectionAssetHandler;
        this.sitemapHandler = config.sitemapHandler;
        this.sitemapChunkHandler = config.sitemapChunkHandler;
        this.sitemapStore = config.sitemapStore;
        this.enforcePageCsp = config.enforcePageCsp ?? true;
        this.logger = config.logger;
        this.basePath = config.runner.basePath === "/" ? "" : config.runner.basePath;
        this.cmsPathPrefix = `${this.basePath}/.cms`;
        mountKernelRoutes(this);
        mountAuthRoutes(this);
    }
}
