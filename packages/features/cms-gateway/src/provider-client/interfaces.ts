import type { ContractRelease } from "@bernouy/cms-repository/contracts";
import type { GatewayTransportRequest, GatewayTransportResponse } from "cms-gateway/invocation/interfaces/Invocation";

export interface ProviderCapabilityClient {
    invoke(
        release: ContractRelease,
        capabilityId: string,
        input: unknown,
        options?: Pick<GatewayTransportRequest, "idempotencyKey" | "binaryBody" | "bindingId">,
    ): Promise<GatewayTransportResponse>;
}
export interface ProviderConnectionRegistry {
    configure(input: {
        connectionId: string;
        cmsUrl: string;
        token: string;
        generation: number;
    }): Promise<{ connectionId: string; configured: boolean }>;
}
export class ProviderClientError extends Error {
    constructor(
        readonly code: string,
        readonly retryable: boolean,
        readonly status?: number,
    ) {
        super(`Provider capability rejected: ${code}`);
        this.name = "ProviderClientError";
    }
}

export class ProviderConnectionConflict extends Error {
    constructor() {
        super("Provider connection revision conflict");
        this.name = "ProviderConnectionConflict";
    }
}
