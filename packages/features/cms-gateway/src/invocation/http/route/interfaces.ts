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
    resolveContract(value: { siteId: string; contractId: string }): Promise<AdmittedContractRelease>;
}
export interface GatewayHttpTransportRequest extends GatewayTransportRequest {
    readonly binding: CompiledHttpBinding;
}
export interface GatewayHttpTransportResponse extends GatewayTransportResponse {
    readonly status: number;
}
