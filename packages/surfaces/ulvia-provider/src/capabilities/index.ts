import type { ProviderCapabilityRegistry } from "../dispatch/registry";
import type {
    CmsFileWorkspace,
    UlviaProviderDependencies,
    UlviaProviderGateway,
    UlviaProviderManagement,
} from "../ports";
import { registerObservabilityCapabilities } from "./observability";
import { registerAccessCapabilities } from "./access";
import { registerContentCapabilities } from "./content";
import { registerFileCapabilities } from "./files";
import { registerSmtpEmailerCapabilities } from "./emailer";
import { registerCollectionAuthoringCapabilities } from "./installations/authoring";
import { registerInstallationCapabilities } from "./installations";
import { registerSecretCapabilities } from "./secrets";
import type { CollectionSources } from "./installations/sources";
import type { ProviderOperationExecutor } from "../operations/ProviderOperationExecutor";
import type { CmsFilesService } from "@bernouy/cms-files";

export function registerOfficialProviderCapabilities(
    dispatcher: ProviderCapabilityRegistry,
    dependencies: UlviaProviderDependencies,
    gateway: UlviaProviderGateway | undefined,
    operations?: ProviderOperationExecutor,
    providerManagement?: UlviaProviderManagement,
    collectionSources?: CollectionSources,
    files?: CmsFilesService,
    fileWorkspace?: CmsFileWorkspace,
    enabledContractIds?: ReadonlySet<string>,
): void {
    if (enabledContractIds?.has("ulvia.cms.repository")) {
        registerCollectionAuthoringCapabilities(dispatcher, dependencies.collectionAuthoring);
    }
    if (dependencies.observability && enabledContractIds?.has("ulvia.cms.observability")) {
        registerObservabilityCapabilities(dispatcher, dependencies.observability);
    }
    registerContentCapabilities(dispatcher, dependencies);
    registerInstallationCapabilities(
        dispatcher,
        dependencies,
        gateway,
        operations,
        providerManagement,
        collectionSources,
    );
    if (files) {
        registerFileCapabilities(dispatcher, files, fileWorkspace);
    }
    if (dependencies.secrets && enabledContractIds?.has("ulvia.cms.secrets")) {
        registerSecretCapabilities(dispatcher, dependencies.secrets);
    }
    if (dependencies.emailer && enabledContractIds?.has("ulvia.cms.emailer.smtp")) {
        registerSmtpEmailerCapabilities(dispatcher, { emailer: dependencies.emailer });
    }
    registerAccessCapabilities(dispatcher, dependencies, gateway);
}

export {
    registerAccessCapabilities,
    registerObservabilityCapabilities,
    registerContentCapabilities,
    registerSmtpEmailerCapabilities,
    registerFileCapabilities,
    registerInstallationCapabilities,
    registerSecretCapabilities,
};
export type { CmsSmtpEmailerDependencies } from "./emailer";
export {
    CollectionSources,
    registerCollectionInstallationCapabilities,
    registerCollectionOperationCapabilities,
    registerProviderInstallationCapabilities,
} from "./installations";
export type {
    CmsFileWorkspace,
    UlviaProviderDependencies,
    UlviaProviderGateway,
    UlviaProviderManagement,
} from "../ports";
