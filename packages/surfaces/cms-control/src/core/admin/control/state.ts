import type { Authentication } from "@bernouy/cms-auth";
import type { CmsRepository } from "@bernouy/cms-content";
import { InMemoryCmsFileMutationJournal } from "@bernouy/cms-content/files";
import { InMemoryCache, type Runner } from "@bernouy/http-runner";
import type { ControlCmsDependencies, ControlCmsState } from "cms-control/core/admin/control/types";

export type ControlCmsConstructorInput = {
    runner: Runner;
    repository: CmsRepository;
    auth: Authentication;
    dependencies: ControlCmsDependencies;
};

export function createControlCmsState(input: ControlCmsConstructorInput): ControlCmsState {
    const configuration = input.dependencies.configuration ?? {};
    return {
        configuration,
        runner: input.runner,
        repository: input.repository,
        auth: input.auth,
        cache: input.dependencies.cache || new InMemoryCache(),
        filesMetadata: input.dependencies.filesMetadata ?? null,
        filesBlob: input.dependencies.filesBlob ?? null,
        fileMutations:
            input.dependencies.fileMutations ??
            (input.dependencies.filesMetadata && input.dependencies.filesBlob
                ? new InMemoryCmsFileMutationJournal()
                : null),
        identityProviders: input.dependencies.identityProviders ?? null,
    };
}
