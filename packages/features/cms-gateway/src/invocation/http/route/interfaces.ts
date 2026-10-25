import type { AdmittedContractRelease, CapabilityDefinition } from "@bernouy/cms-repository/contracts";
import type { CompiledHttpBinding } from "@bernouy/cms-repository/contracts/bindings";
import type { GatewayInvoker, GatewayTransportRequest, GatewayTransportResponse } from "../../interfaces/Invocation";

export interface GatewayHttpRouteRequest {
    readonly siteId: string;
    readonly contractId: string;
    readonly method: string;
    readonly path: string;
}
export interface GatewayHttpRoute {
    readonly capability: CapabilityDefinition;
    readonly binding: CompiledHttpBinding;
    readonly bindingId?: string;
    readonly pathValues: Readonly<Record<string, string>>;
}
export interface GatewayHttpInvoker extends GatewayInvoker {
    resolveContract?(value: { siteId: string; contractId: string }): Promise<AdmittedContractRelease>;
    /** Compatibility for host-supplied HTTP resolvers; never required by the domain Gateway. */
    resolveHttp?(value: GatewayHttpRouteRequest): Promise<GatewayHttpRoute>;
}
export interface GatewayHttpTransportRequest extends GatewayTransportRequest {
    readonly binding: CompiledHttpBinding;
}
export interface GatewayHttpTransportResponse extends GatewayTransportResponse {
    readonly status: number;
}
