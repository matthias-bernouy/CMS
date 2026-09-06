import type { SecretReader, SecretStore } from "@bernouy/cms-secrets";
import type { IntegrationInstallation } from "../../../interfaces/IntegrationInstallation";
import type { IntegrationInstallationRepository } from "../../../interfaces/IntegrationInstallationRepository";
import type { IntegrationManagementInvocation } from "../../../interfaces/Integration/management";
export type IntegrationManagementDeps = {
    resolvePublishedPage?: import("../../../interfaces/IntegrationImport").IntegrationPublishedPageResolver;
    installations: IntegrationInstallationRepository;
    secrets: SecretStore;
    invoke(
        installation: IntegrationInstallation,
        functionId: string,
        payload: IntegrationManagementInvocation,
        secrets: SecretReader,
    ): Promise<unknown>;
    syncRuntimeSecrets?(installation: IntegrationInstallation, values: Record<string, string>): Promise<void>;
    now?: () => Date;
    healthTtlMs?: number;
    healthTimeoutMs?: number;
};
