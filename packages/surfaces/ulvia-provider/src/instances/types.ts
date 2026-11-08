import type { SystemInstallationPlan } from "./installationPlan";
export const PROVIDER_INSTANCE_STATUSES = ["provisioning", "upgrading", "ready", "failed", "disabled"] as const;

export type ProviderInstanceStatus = (typeof PROVIDER_INSTANCE_STATUSES)[number];

export type ProviderInstanceRecord = Readonly<{
    id: string;
    idempotencyKey: string;
    idempotencyFingerprint: string;
    storageKey: string;
    cmsUrl: string;
    gatewayUrl: string;
    label: string;
    status: ProviderInstanceStatus;
    systemPlan?: SystemInstallationPlan;
    repository?: SiteRepositoryConfiguration;
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
