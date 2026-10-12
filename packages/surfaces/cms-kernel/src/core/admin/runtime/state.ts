import type { CmsRepository } from "@bernouy/cms-content/kernel";
import type { Runner } from "@bernouy/http-runner";
import type { KernelCmsDependencies, KernelCmsState } from "cms-kernel/core/admin/runtime/types";

export type KernelCmsConstructorInput = {
    runner: Runner;
    repository: CmsRepository;
    dependencies: KernelCmsDependencies;
};

export function createKernelCmsState(input: KernelCmsConstructorInput): KernelCmsState {
    const configuration = input.dependencies.configuration;
    return {
        configuration,
        runner: input.runner,
        repository: input.repository,
        identityProviders: input.dependencies.identityProviders ?? null,
    };
}
