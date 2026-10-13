export const PROVIDER_INSTANCE_STATUSES = ["provisioning", "upgrading", "ready", "failed", "disabled"] as const;

export type ProviderInstanceStatus = (typeof PROVIDER_INSTANCE_STATUSES)[number];

export type ProviderInstanceProfile = Readonly<{
    id: string;
    version: string;
}>;

export type ProviderInstanceRecord = Readonly<{
    id: string;
    idempotencyKey: string;
    idempotencyFingerprint: string;
    storageKey: string;
    kernelUrl: string;
    label: string;
    status: ProviderInstanceStatus;
    profile: ProviderInstanceProfile;
    failure?: string;
    revision: number;
    createdAt: string;
    updatedAt: string;
}>;

export type CreateProviderInstanceRecord = Omit<ProviderInstanceRecord, "revision" | "createdAt" | "updatedAt">;

export type UpdateProviderInstanceRecord = Readonly<{
    status?: ProviderInstanceStatus;
    profile?: ProviderInstanceProfile;
    failure?: string | null;
}>;
