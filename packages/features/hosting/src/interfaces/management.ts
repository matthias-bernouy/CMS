import type { ProviderInstanceAdministrator } from "hosting/instances/core/provisioning";
import type { ProviderInstanceStatus } from "hosting/instances/interfaces/types";

export interface CreateHostedInstance {
    readonly requestId: string;
    readonly label: string;
    readonly origin: string;
    readonly administrator: ProviderInstanceAdministrator;
}

/** Hosting DTOs deliberately omit credentials, storage addresses and installation internals. */
export interface HostedInstance {
    readonly id: string;
    readonly label: string;
    readonly origin: string;
    readonly status: ProviderInstanceStatus;
    readonly revision: number;
    readonly createdAt: string;
    readonly updatedAt: string;
}
