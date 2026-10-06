import type { ProviderInstallationPreparation } from "cms-repository/providers/installations/interfaces/ProviderInstallationPreparation";
import type { ProviderRuntimeReport } from "cms-repository/providers/installations/interfaces/ProviderRuntimeReport";
import { secretRefToKey } from "@bernouy/secret-store";
import type { ProviderConnectionPreview, ProviderConnectionPreviewInput } from "./connectionTypes";

export function validatePreviewInput(input: ProviderConnectionPreviewInput): void {
    if (!input.token || input.token.length > 512 || /[\r\n]/u.test(input.token)) {
        throw new TypeError("Invalid provider token");
    }
    if (Boolean(input.installationId) !== (input.revision !== undefined)) {
        throw new TypeError("Installation ID and revision must be provided together");
    }
}

export function requiredSecretKey(reference: string): string {
    const key = secretRefToKey(reference);
    if (!key) {
        throw new Error("Provider credential reference is invalid");
    }
    return key;
}

export function previewResult(
    ticket: string,
    operation: ProviderInstallationPreparation["operation"],
    providerName: string,
    endpoint: string,
    manifestDigest: string,
    report: ProviderRuntimeReport,
): ProviderConnectionPreview {
    return {
        ticket,
        operation: operation === "modify" ? "reconnect" : "connect",
        providerId: report.providerId,
        providerName,
        accountId: report.account.id,
        accountLabel: report.account.label,
        endpoint,
        manifestVersion: report.manifest.version,
        manifestDigest,
        contracts: report.implementations.map(({ contractId, version, status }) => ({ contractId, version, status })),
        check: "Manifest and runtime report validated; live conformance is not yet implemented.",
    };
}
