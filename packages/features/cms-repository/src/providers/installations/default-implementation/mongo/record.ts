import { isSha256Digest } from "@bernouy/binary-media";
import { deepFreeze } from "@bernouy/ulvia-contracts/protocol";
import { parseDateTime } from "@bernouy/ulvia-providers/validation";
import { parseProviderInstallation } from "@bernouy/ulvia-providers/installations";
import { parseProviderRuntimeReport } from "@bernouy/ulvia-providers/installations";
import { installationSelectionDigest } from "../../core/selectionRevision";
import type { ProviderInstallationLimits } from "@bernouy/ulvia-providers/installations";
import type { StoredProviderInstallation } from "@bernouy/ulvia-providers/installations";

export interface InstallationDocument extends StoredProviderInstallation {
    readonly _id: string;
    readonly siteId: string;
    /** Digest persisted with every approved configuration. */
    readonly selectionDigest: string;
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
    if (!isSha256Digest(document.selectionDigest)) {
        throw new TypeError("Stored provider installation requires a valid selection digest");
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

export async function installationDocument(record: StoredProviderInstallation): Promise<InstallationDocument> {
    return {
        _id: record.installation.id,
        siteId: record.installation.siteId,
        ...structuredClone(record),
        selectionDigest: await installationSelectionDigest(record.installation),
    };
}
