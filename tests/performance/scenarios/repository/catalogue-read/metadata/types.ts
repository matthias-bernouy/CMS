import type { ContractParentReference } from "@bernouy/ulvia-contracts";
import type { registryCalls } from "../../client";

export type PublicKind = "collection" | "contract" | "provider-manifest";
export type PublicReference = Readonly<{
    kind: PublicKind;
    publisherId: string;
    id: string;
    version: string;
    digest: string;
}>;
export type PublicResource = Readonly<{
    reference: PublicReference;
    canonicalJson: string;
    manifest: Uint8Array;
    assets: readonly Readonly<{ id: string; bytes: Uint8Array; digest: string }>[];
    name: string;
    description: string;
    metadata: Readonly<Record<string, unknown>>;
    contractIds: readonly string[];
    bootstrap?: Readonly<{
        label: string;
        description: string;
        frenchLabel: string;
        frenchDescription: string;
        pageCount: number;
        includeCount: number;
    }>;
}>;
export type PublishedResource = PublicResource & Readonly<{ startedAt: number; finishedAt: number }>;
export type RegistryReadPorts = ReturnType<typeof registryCalls>;
export type PublicResourceFactory = (kind: PublicKind, index: number, patch: number) => Promise<PublicResource>;
export type DiscoveryImplementation = ContractParentReference;
