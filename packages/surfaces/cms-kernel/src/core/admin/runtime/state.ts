import type { Authentication } from "@bernouy/cms-auth";
import type { CmsRepository } from "@bernouy/cms-content/kernel";
import { InMemoryCache, type Runner } from "@bernouy/http-runner";
import type { KernelCmsDependencies, KernelCmsState } from "cms-kernel/core/admin/runtime/types";

export type KernelCmsConstructorInput = {
    runner: Runner;
    repository: CmsRepository;
    auth: Authentication;
    dependencies: KernelCmsDependencies;
};

export function createKernelCmsState(input: KernelCmsConstructorInput): KernelCmsState {
    const configuration = input.dependencies.configuration;
    return {
        configuration,
        runner: input.runner,
        repository: input.repository,
        auth: input.auth,
        cache: input.dependencies.cache || new InMemoryCache(),
        identityProviders: input.dependencies.identityProviders ?? null,
    };
}
