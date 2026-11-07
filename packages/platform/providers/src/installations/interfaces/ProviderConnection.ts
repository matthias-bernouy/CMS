/** Server-owned connection target after the submitted API key has been put in the secret store. */
export interface ProviderConnectionTarget {
    readonly endpoint: string;
    readonly providerTokenRef: string;
}

/** Sensitive bootstrap body, sent only after approval. Never persist or log this DTO. */
export interface ProviderGatewayRegistrationRequest {
    readonly protocol: "ulvia-provider/v1";
    readonly installationId: string;
    readonly gatewayUrl: string;
    readonly gatewayToken: string;
}

export interface ProviderGatewayRegistrationResponse {
    readonly protocol: "ulvia-provider/v1";
    readonly installationId: string;
    readonly providerId: string;
    readonly accountId: string;
}
