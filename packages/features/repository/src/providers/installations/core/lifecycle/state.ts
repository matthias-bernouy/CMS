import { timestamp, assertMaxAge } from "@bernouy/ulvia-providers/validation";
import type { ProviderInstallationCandidate } from "repository/providers/installations/interfaces/ProviderInstallationStore";
import type { ProviderInstallationScope, StoredProviderInstallation } from "@bernouy/ulvia-providers/installations";
import { ProviderInstallationWorkflowError } from "@bernouy/ulvia-providers/installations";

export function installationScope(record: StoredProviderInstallation): ProviderInstallationScope {
    return { installationId: record.installation.id, siteId: record.installation.siteId };
}

export function assertFreshPreparation(preparedAt: string, now: string, maxAgeMs: number): void {
    assertMaxAge(maxAgeMs);
    const age = timestamp(now) - timestamp(preparedAt);
    if (age < 0 || age > maxAgeMs) {
        throw new ProviderInstallationWorkflowError(
            "stale_timestamp",
            "Preparation is stale or ahead of the CMS clock",
        );
    }
}

export function assertRevision(record: StoredProviderInstallation, revision: number): void {
    if (!Number.isSafeInteger(revision) || revision !== record.revision || revision >= Number.MAX_SAFE_INTEGER) {
        throw new ProviderInstallationWorkflowError("revision_conflict", "Installation revision changed");
    }
}

export function assertActive(record: StoredProviderInstallation): void {
    if (record.installation.status === "revoked") {
        throw new ProviderInstallationWorkflowError(
            "installation_revoked",
            "Revocation is terminal; create a new connection",
        );
    }
}

export function assertIdentity(record: StoredProviderInstallation, candidate: ProviderInstallationCandidate): void {
    for (const key of ["id", "siteId", "providerId", "accountId"] as const) {
        if (record.installation[key] !== candidate[key]) {
            throw new ProviderInstallationWorkflowError(
                "identity_change",
                "Connection identity requires a new installation",
            );
        }
    }
}

export function assertCurrentTimestamp(record: StoredProviderInstallation, now: string): void {
    const current = timestamp(now);
    const latest = Math.max(
        timestamp(record.installation.updatedAt),
        timestamp(record.installation.approval.approvedAt),
        record.observation === undefined ? -Infinity : timestamp(record.observation.observedAt),
    );
    if (current < latest) {
        throw new ProviderInstallationWorkflowError("stale_timestamp", "The CMS clock predates stored state");
    }
}
