import { deepFreeze } from "cms-repository/exports/contracts/protocol";
import type { AdmittedProviderManifest } from "cms-repository/providers/manifests/core/admission/admitProviderManifest";
import { rejectUnknownKeys } from "cms-repository/providers/manifests/core/values";
import type { ProviderInstallation } from "../../interfaces/ProviderInstallation";
import type { ProviderInstallationCandidate } from "../../interfaces/ProviderInstallationStore";
import type { ProviderInstallationLimits } from "../limits";
import { parseInstallationDocument } from "../parsing/documents";
import { validateProviderInstallation } from "../validateProviderInstallation";

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
