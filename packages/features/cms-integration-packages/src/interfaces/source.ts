import type { IntegrationPackageEnvelopeV1 } from "./envelope";

export type ResolvedIntegrationPackage = {
    readonly envelope: IntegrationPackageEnvelopeV1;
    readonly canonicalBytes: Uint8Array;
    readonly digest: string;
};

export type ResolvedIntegrationPackageMetadata = {
    readonly kind: string;
    readonly version: string;
    readonly digest: string;
    readonly canonicalBytes: number;
};

export interface IntegrationPackageSource {
    getPackage(kind: string, version: string): Promise<ResolvedIntegrationPackage | null>;
    getPackageMetadata?(kind: string, version: string): Promise<ResolvedIntegrationPackageMetadata | null>;
}
