import type { AdmittedContractRelease } from "@bernouy/ulvia-contracts";
import type { AdmittedProviderManifest } from "@bernouy/ulvia-providers";
import type { GatewayRoute } from "cms-gateway/invocation/interfaces/Invocation";

export interface GatewayDefinition {
    readonly key: string;
    readonly json: string;
}
export interface GatewayRoutePacket {
    readonly snapshot: string;
    readonly definitions: readonly GatewayDefinition[];
}
export interface GatewayContractPacket {
    readonly found: boolean;
    readonly key: string;
    readonly definitions: readonly GatewayDefinition[];
}
export interface GatewayRouteSource {
    readonly route: GatewayRoute;
    readonly characters: number;
}
export type GatewayDefinitionValue = AdmittedContractRelease | AdmittedProviderManifest;
export interface GatewayDefinitionEntry {
    readonly value: GatewayDefinitionValue;
    readonly json: string;
    readonly bytes: number;
    leases: number;
}
export interface GatewayDefinitionLease {
    readonly known: readonly string[];
    get(key: string): GatewayDefinitionEntry | undefined;
    release(): void;
}
export type ReferencedGatewayRoute = Omit<GatewayRoute, "release" | "requestedRelease" | "manifest"> & {
    release: Omit<GatewayRoute["release"], "admission"> & { admission: string };
    requestedRelease: Omit<GatewayRoute["requestedRelease"], "admission"> & { admission: string };
    manifest: Omit<GatewayRoute["manifest"], "admission"> & { admission: string };
};
