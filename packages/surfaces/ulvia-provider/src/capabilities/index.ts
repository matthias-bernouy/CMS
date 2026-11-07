import type { ProviderCapabilityRegistry } from "../dispatch/registry";
import type {
    CmsFileWorkspace,
    UlviaProviderDependencies,
    UlviaProviderGateway,
    UlviaProviderManagement,
} from "../ports/index";
import { registerObservabilityCapabilities } from "./observability/index";
import { registerAccessCapabilities } from "./access/index";
import { registerContentCapabilities } from "./content/index";
import { registerFileCapabilities } from "./storage/files";
import { registerSmtpEmailerCapabilities } from "./emailer";
import { registerAuthoringCapabilities } from "./installations/authoring/index";
import { registerInstallationCapabilities } from "./installations/index";
import { registerSecretCapabilities } from "./storage/secrets/index";
import type { CollectionSources } from "./installations/sources/index";
import type { ProviderOperationExecutor } from "../operations/ProviderOperationExecutor";
import type { CmsFilesService } from "@bernouy/cms-files";

export async function registerOfficialProviderCapabilities(
    dispatcher: ProviderCapabilityRegistry,
    dependencies: UlviaProviderDependencies,
    gateway: UlviaProviderGateway | undefined,
    operations?: ProviderOperationExecutor,
    providerManagement?: UlviaProviderManagement,
    collectionSources?: CollectionSources,
    files?: CmsFilesService,
    fileWorkspace?: CmsFileWorkspace,
    enabledContractIds?: ReadonlySet<string>,
    smtpOptions?: ProviderRegistrationOptions,
): Promise<void> {
    if (enabledContractIds?.has("ulvia/cms.authoring")) {
        registerAuthoringCapabilities(dispatcher, dependencies.authoring);
    }
    if (dependencies.observability && enabledContractIds?.has("ulvia/cms.observability")) {
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
    if (dependencies.secrets && enabledContractIds?.has("ulvia/cms.secrets")) {
        registerSecretCapabilities(dispatcher, dependencies.secrets);
    }
    if (dependencies.emailer && enabledContractIds?.has("ulvia/cms.emailer.smtp")) {
        if (!smtpOptions) {
            throw new TypeError("SMTP registration requires exact scope and durable keyed execution");
        }
        await registerSmtpEmailerCapabilities(dispatcher, { emailer: dependencies.emailer }, smtpOptions);
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
export { registerRepositoryCapabilities } from "./registry";
export {
    CollectionSources,
    registerCollectionInstallationCapabilities,
    registerCollectionOperationCapabilities,
    registerProviderInstallationCapabilities,
} from "./installations/index";
export type {
    CmsFileWorkspace,
    UlviaProviderDependencies,
    UlviaProviderGateway,
    UlviaProviderManagement,
} from "../ports/index";

import type { ProviderRegistrationOptions } from "@bernouy/ulvia-sdk/provider";
