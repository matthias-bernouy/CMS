import type { SystemInstallationPlan } from "hosting/instances/interfaces/installationPlan";
import type { HostingActor } from "hosting/interfaces/state";

/** Internal provenance, supplied by authenticated hosting or operator entry points. */
export type InstanceCreationAuthority = Readonly<{ kind: "operator" } | { kind: "control"; actor: HostingActor }>;
export const PROVIDER_INSTANCE_STATUSES = ["provisioning", "upgrading", "ready", "failed", "disabled"] as const;

export type ProviderInstanceStatus = (typeof PROVIDER_INSTANCE_STATUSES)[number];

export type ProviderInstanceRecord = Readonly<{
    id: string;
    idempotencyKey: string;
    idempotencyFingerprint: string;
    creationAuthority: InstanceCreationAuthority;
    storageKey: string;
    cmsUrl: string;
    gatewayUrl: string;
    label: string;
    status: ProviderInstanceStatus;
    systemPlan?: SystemInstallationPlan;
    repository: SiteRepositoryConfiguration;
    failure?: string;
    revision: number;
    createdAt: string;
    updatedAt: string;
}>;

export type CreateProviderInstanceRecord = Omit<ProviderInstanceRecord, "revision" | "createdAt" | "updatedAt">;

export type UpdateProviderInstanceRecord = Readonly<{
    status?: ProviderInstanceStatus;
    systemPlan?: SystemInstallationPlan;
    repository?: SiteRepositoryConfiguration;
    failure?: string | null;
}>;

export type SiteRepositoryConfiguration = Readonly<{
    url: string;
    configured: boolean;
}>;
