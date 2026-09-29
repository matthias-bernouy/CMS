import { deepFreeze } from "cms-repository/exports/contracts/protocol";
import { parseDateTime } from "cms-repository/providers/manifests/core/parsing/identifiers";
import { parseProviderInstallation } from "../../core/parsing/parseProviderInstallation";
import { parseProviderRuntimeReport } from "../../core/reports/parseProviderRuntimeReport";
import type { ProviderInstallationLimits } from "../../core/limits";
import type { StoredProviderInstallation } from "../../interfaces/ProviderInstallationStore";

export interface InstallationDocument extends StoredProviderInstallation {
    readonly _id: string;
    readonly siteId: string;
}

export function readInstallationDocument(
    document: InstallationDocument,
    limits: Readonly<ProviderInstallationLimits>,
): StoredProviderInstallation {
    const installation = parseProviderInstallation(document.installation, limits);
    if (document._id !== installation.id || document.siteId !== installation.siteId) {
        throw new Error("Stored provider installation has mismatched identity");
    }
    if (!Number.isSafeInteger(document.revision) || document.revision < 1) {
        throw new Error("Stored provider installation has invalid revision");
    }
    const observation = document.observation;
    return deepFreeze({
        installation,
        revision: document.revision,
        ...(observation === undefined
            ? {}
            : {
                  observation: {
                      observedAt: parseDateTime(observation.observedAt, "$.observation.observedAt"),
                      report: parseProviderRuntimeReport(observation.report, limits),
                  },
              }),
    });
}

export function installationDocument(record: StoredProviderInstallation): InstallationDocument {
    return {
        _id: record.installation.id,
        siteId: record.installation.siteId,
        ...structuredClone(record),
    };
}
