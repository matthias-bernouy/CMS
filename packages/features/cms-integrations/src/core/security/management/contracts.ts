import type { SecretReader, SecretStore } from "@bernouy/cms-secrets";
import type { IntegrationInstallation } from "../../../interfaces/IntegrationInstallation";
import type { IntegrationInstallationRepository } from "../../../interfaces/IntegrationInstallationRepository";
import type { IntegrationManagementInvocation } from "../../../interfaces/Integration/management";
export type IntegrationRuntimeDeps = {
    resolvePublishedPage?: import("../../../interfaces/IntegrationImport").IntegrationPublishedPageResolver;
    installations: IntegrationInstallationRepository;
    secrets: SecretStore;
    syncRuntimeSecrets?(installation: IntegrationInstallation, values: Record<string, string>): Promise<void>;
    now?: () => Date;
    healthTtlMs?: number;
    healthTimeoutMs?: number;
};

export type IntegrationManagementDeps = IntegrationRuntimeDeps & {
    invoke(
        installation: IntegrationInstallation,
        functionId: string,
        payload: IntegrationManagementInvocation,
        secrets: SecretReader,
    ): Promise<unknown>;
};
