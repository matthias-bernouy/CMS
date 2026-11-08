/** Exact admitted system resources; initial provisioning reads the image snapshot. Collections stay separate. */
export type SystemInstallationPlan = Readonly<{
    manifest: Readonly<{ providerId: string; version: string; digest: string }>;
    contracts: readonly Readonly<{ contractId: string; version: string; digest: string }>[];
}>;
export interface SystemInstallationSource {
    current(): Promise<SystemInstallationPlan>;
}
