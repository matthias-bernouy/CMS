import type { Authentication, IdentityProviderRepository } from "@bernouy/cms-auth";
import type { CmsRepository } from "@bernouy/cms-content/kernel";
import type { Cache, Runner } from "@bernouy/http-runner";
import type { KernelCmsConfig } from "cms-kernel/interfaces/KernelCmsConfig";

export type KernelCmsOptions = Pick<
    KernelCmsConfig,
    "publicUrl" | "publicAuth" | "administrator" | "collections" | "capabilityGateway"
>;

export type AdminAuthBackends = NonNullable<KernelCmsConfig["authBackends"]>;

export type KernelCmsDependencies = {
    configuration: KernelCmsOptions;
    cache?: KernelCmsConfig["cache"];
    identityProviders?: KernelCmsConfig["identityProviders"];
};

export type KernelCmsState = {
    configuration: KernelCmsOptions;
    runner: Runner;
    repository: CmsRepository;
    auth: Authentication;
    cache: Cache;
    identityProviders: IdentityProviderRepository | null;
};
