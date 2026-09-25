import type { ProviderRuntimeObservation } from "./ProviderRuntimeReport";
import type { ProviderInstallationCandidate } from "./ProviderInstallationStore";

export type ProviderInstallationChanges = Partial<
    Pick<
        ProviderInstallationCandidate,
        "endpoint" | "manifestVersion" | "manifestDigest" | "providerTokenRef" | "configuration"
    >
> & {
    /** Remove the local reference only; secret revocation and gateway grants belong to the host. */
    readonly gatewayTokenRef?: string | null;
};

/** A validated proposal awaiting an explicit action by an authorized host caller. */
export interface ProviderInstallationPreparation {
    readonly kind: "provider-installation-preparation";
    readonly operation: "approve" | "modify";
    readonly candidate: ProviderInstallationCandidate;
    readonly observation: ProviderRuntimeObservation;
    readonly preparedAt: string;
    readonly expectedRevision?: number;
}
