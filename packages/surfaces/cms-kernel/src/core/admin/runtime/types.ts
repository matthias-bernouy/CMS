import type { IdentityProviderRepository } from "@bernouy/cms-auth";
import type { CmsRepository } from "@bernouy/cms-content/kernel";
import type { Runner } from "@bernouy/http-runner";
import type { KernelCmsConfig } from "cms-kernel/interfaces/KernelCmsConfig";

type KernelCmsOptions = Pick<KernelCmsConfig, "publicAuth" | "collections" | "capabilityGateway">;

export type AdminAuthBackends = NonNullable<KernelCmsConfig["authBackends"]>;

export type KernelCmsDependencies = {
    configuration: KernelCmsOptions;
    identityProviders?: KernelCmsConfig["identityProviders"];
};

export type KernelCmsState = {
    configuration: KernelCmsOptions;
    runner: Runner;
    repository: CmsRepository;
    identityProviders: IdentityProviderRepository | null;
};
