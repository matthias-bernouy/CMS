export type ContractSelection = {
    contractId: string;
    version: string;
    digest: string;
    installationId: string;
};

export type ProviderInstallation = {
    id: string;
    providerId: string;
    accountId: string;
    endpoint: string;
    status: "enabled" | "disabled" | "revoked";
    manifestVersion: string;
    revision: number;
    observedAt?: string;
};

export type ProviderList = {
    selectionRevision: number;
    installations: ProviderInstallation[];
    selections: ContractSelection[];
};

export type ProviderDetail = ProviderInstallation & {
    contracts: {
        contractId: string;
        version: string;
        digest: string;
        status: "ready" | "setup-required" | "unavailable";
    }[];
    selections: ContractSelection[];
};
