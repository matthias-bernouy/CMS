import { mountKernelRoutes } from "cms-kernel/http/mountKernelRoutes";
import type { KernelCmsConfig } from "cms-kernel/KernelCmsConfig";
import { mountAuthRoutes } from "cms-kernel/http/auth/mountAuthRoutes";
import type { ContentReader } from "@bernouy/cms-content/rendering";
import type { BlobStore } from "@bernouy/blob-store";

export type { KernelCmsConfig } from "cms-kernel/KernelCmsConfig";

export default class KernelCms {
    readonly runner;
    readonly cache;
    readonly content: ContentReader;
    readonly authentication;
    readonly publicAuth;
    readonly authBackends;
    readonly identityProviders;
    readonly collections;
    readonly collectionAssets;
    readonly capabilityGateway;
    readonly pageExecution;
    readonly sitemapStore?: BlobStore;
    readonly enforcePageCsp: boolean;
    readonly basePath: string;
    readonly cmsPathPrefix: string;

    constructor(config: KernelCmsConfig) {
        this.runner = config.runner;
        this.cache = config.cache;
        this.content = config.content;
        this.authentication = config.authentication;
        this.publicAuth = config.publicAuth;
        this.authBackends = config.authBackends;
        this.identityProviders = config.identityProviders;
        this.collections = config.collections;
        this.collectionAssets = config.collectionAssets;
        this.capabilityGateway = config.capabilityGateway;
        this.pageExecution = config.pageExecution;
        this.sitemapStore = config.sitemapStore;
        this.enforcePageCsp = config.enforcePageCsp ?? true;
        this.basePath = config.runner.basePath === "/" ? "" : config.runner.basePath;
        this.cmsPathPrefix = `${this.basePath}/.cms`;
        mountKernelRoutes(this);
        mountAuthRoutes(this);
    }
}
