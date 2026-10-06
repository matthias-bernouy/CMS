import type { ProviderInstallationLifecycle } from "cms-repository/providers/installations/core/lifecycle/ProviderInstallationLifecycle";
import type { ProviderInstallationPreparation } from "cms-repository/providers/installations/interfaces/ProviderInstallationPreparation";
import type { ProviderRuntimeReport } from "cms-repository/providers/installations/interfaces/ProviderRuntimeReport";

export type ProviderConnectionPreviewInput = {
    providerId: string;
    version: string;
    endpoint: string;
    token: string;
    installationId?: string;
    revision?: number;
};

export type ProviderConnectionPreview = {
    ticket: string;
    operation: "connect" | "reconnect";
    providerId: string;
    providerName: string;
    accountId: string;
    accountLabel: string;
    endpoint: string;
    manifestVersion: string;
    manifestDigest: string;
    contracts: { contractId: string; version: string; status: string }[];
    check: string;
};

export type ProviderReportReader = (endpoint: string, token: string) => Promise<ProviderRuntimeReport>;

export type ProviderConnectionLifecycle = Pick<
    ProviderInstallationLifecycle,
    "prepare" | "prepareModification" | "approve" | "modify" | "observe"
>;

export type PendingProviderConnection = {
    preparation: ProviderInstallationPreparation;
    token: string;
    actorId: string;
    createdAt: number;
    previousTokenKey?: string;
};

export type ProviderConnectionDependencies = {
    lifecycle?: ProviderConnectionLifecycle;
    readReport: ProviderReportReader;
    createId?: () => string;
    now?: () => number;
};
