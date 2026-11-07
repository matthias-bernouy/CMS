import type { ImplementationOptions } from "ulvia-sdk/interfaces/providers";

/** Trusted build output shipped with its executor code; never obtained from an installed catalogue. */
export interface ImplementationArtifact {
    readonly kind: "ulvia-sdk-runtime/v1";
    readonly contracts: readonly Readonly<{ canonicalJson: string; digest: string }>[];
    readonly implementations: readonly (ImplementationOptions &
        Readonly<{
            contractId: string;
            version: string;
            digest: string;
            requires: NonNullable<ImplementationOptions["requires"]>;
        }>)[];
}
