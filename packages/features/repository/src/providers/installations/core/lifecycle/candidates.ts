import { deepFreeze } from "@bernouy/ulvia-contracts/protocol";
import type { AdmittedProviderManifest } from "@bernouy/ulvia-providers";
import { rejectUnknownKeys } from "@bernouy/ulvia-providers/validation";
import type { ProviderInstallation } from "@bernouy/ulvia-providers/installations";
import type { ProviderInstallationCandidate } from "../../interfaces/ProviderInstallationStore";
import type { ProviderInstallationLimits } from "@bernouy/ulvia-providers/installations";
import { parseInstallationDocument } from "@bernouy/ulvia-providers/validation";
import { validateProviderInstallation } from "@bernouy/ulvia-providers/installations";

export function candidateFromInstallation(installation: ProviderInstallation): ProviderInstallationCandidate {
    return deepFreeze({
        id: installation.id,
        siteId: installation.siteId,
        providerId: installation.providerId,
        accountId: installation.accountId,
        endpoint: installation.endpoint,
        manifestVersion: installation.approval.manifestVersion,
        manifestDigest: installation.approval.manifestDigest,
        providerTokenRef: installation.providerTokenRef,
        ...(installation.gatewayTokenRef === undefined ? {} : { gatewayTokenRef: installation.gatewayTokenRef }),
        configuration: installation.configuration,
    });
}

export function validateCandidate(
    value: unknown,
    admission: AdmittedProviderManifest,
    now: string,
    limits: Readonly<ProviderInstallationLimits>,
): ProviderInstallationCandidate {
    return parseInstallationDocument(value, limits, (record) => {
        rejectUnknownKeys(
            record,
            [
                "id",
                "siteId",
                "providerId",
                "accountId",
                "endpoint",
                "manifestVersion",
                "manifestDigest",
                "providerTokenRef",
                "gatewayTokenRef",
                "configuration",
            ],
            "$",
        );
        const { manifestVersion, manifestDigest, ...fields } = record;
        return candidateFromInstallation(
            validateProviderInstallation(
                {
                    ...fields,
                    status: "enabled",
                    approval: { manifestVersion, manifestDigest, approvedAt: now, approvedBy: "pending-approval" },
                    createdAt: now,
                    updatedAt: now,
                },
                admission,
                limits,
            ),
        );
    });
}

export function approvedInstallation(
    candidate: ProviderInstallationCandidate,
    approvedBy: string,
    now: string,
    admission: AdmittedProviderManifest,
    limits: Readonly<ProviderInstallationLimits>,
    previous?: ProviderInstallation,
): ProviderInstallation {
    const { manifestVersion, manifestDigest, ...fields } = candidate;
    return validateProviderInstallation(
        {
            ...fields,
            status: previous?.status ?? "enabled",
            approval: { manifestVersion, manifestDigest, approvedAt: now, approvedBy },
            createdAt: previous?.createdAt ?? now,
            updatedAt: now,
        },
        admission,
        limits,
    );
}
