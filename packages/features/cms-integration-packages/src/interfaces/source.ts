import type { IntegrationPackageEnvelopeV1 } from "./envelope";

export type ResolvedIntegrationPackage = {
    readonly envelope: IntegrationPackageEnvelopeV1;
    readonly canonicalBytes: Uint8Array;
    readonly digest: string;
};

export interface IntegrationPackageSource {
    getPackage(kind: string, version: string): Promise<ResolvedIntegrationPackage | null>;
}
