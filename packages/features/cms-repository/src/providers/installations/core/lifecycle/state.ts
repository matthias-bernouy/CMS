import { parseDateTime } from "cms-repository/providers/manifests/core/parsing/identifiers";
import type {
    ProviderInstallationCandidate,
    ProviderInstallationScope,
    StoredProviderInstallation,
} from "../../interfaces/ProviderInstallationStore";
import { ProviderInstallationWorkflowError } from "./errors";

export function installationScope(record: StoredProviderInstallation): ProviderInstallationScope {
    return { installationId: record.installation.id, siteId: record.installation.siteId };
}

export function timestamp(value: string): number {
    const result = Date.parse(parseDateTime(value, "$.timestamp"));
    if (!Number.isFinite(result)) {
        throw new ProviderInstallationWorkflowError("stale_timestamp", "The CMS clock must produce a valid timestamp");
    }
    return result;
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

export function assertMaxAge(maxAgeMs: number): void {
    if (!Number.isSafeInteger(maxAgeMs) || maxAgeMs <= 0) {
        throw new TypeError("Maximum observation/preparation age must be a positive safe integer");
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
