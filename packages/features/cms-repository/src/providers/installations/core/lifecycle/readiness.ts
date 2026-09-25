import type { StoredProviderInstallation } from "../../interfaces/ProviderInstallationStore";
import type { ProviderRuntimeImplementation } from "../../interfaces/ProviderRuntimeReport";
import { assertMaxAge, timestamp } from "./state";

export interface ProviderInstallationReadiness {
    readonly status: "disabled" | "revoked" | "unobserved" | "stale" | "observed";
    /** Exact observed releases only; this is not conformance evidence or a site selection. */
    readonly readyImplementations: readonly ProviderRuntimeImplementation[];
}

/** Administrative enablement alone never supplies an availability claim. */
export function getProviderInstallationReadiness(
    record: StoredProviderInstallation,
    now: string,
    maxObservationAgeMs: number,
): ProviderInstallationReadiness {
    assertMaxAge(maxObservationAgeMs);
    const current = timestamp(now);
    const { installation, observation } = record;
    let status: ProviderInstallationReadiness["status"] =
        installation.status === "enabled" ? "unobserved" : installation.status;
    if (installation.status === "enabled" && observation) {
        const age = current - timestamp(observation.observedAt);
        status =
            age < 0 ||
            age > maxObservationAgeMs ||
            timestamp(observation.observedAt) < timestamp(installation.updatedAt)
                ? "stale"
                : "observed";
    }
    return deepFreeze({
        status,
        readyImplementations:
            status === "observed"
                ? structuredClone(observation!.report.implementations.filter((entry) => entry.status === "ready"))
                : [],
    });
}
import { deepFreeze } from "cms-repository/exports/contracts/protocol";
