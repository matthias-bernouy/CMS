import type { CapabilityDefinition, ContractRelease } from "@bernouy/cms-repository/contracts";
import type { CompiledHttpBinding } from "@bernouy/cms-repository/contracts/bindings";
import type { CatalogueContractRelease } from "@bernouy/cms-repository/contracts/catalogue";
import type { CatalogueProviderManifest } from "@bernouy/cms-repository/providers/catalogue";
import type { StoredProviderInstallation } from "@bernouy/cms-repository/providers/installations";
import type { ContractSelection } from "@bernouy/cms-repository/providers/selections";
import type { ProviderMediaIdentity } from "../media/derivativeKey";

export type GatewayActor =
    | { readonly kind: "anonymous" }
    | { readonly kind: "user" | "administrator"; readonly subjectId: string }
    | { readonly kind: "provider"; readonly installationId: string }
    | { readonly kind: "system"; readonly serviceId: string };

export type GatewayOrigin = "delivery" | "view" | "control" | "provider" | "system" | "conformance";

export interface GatewayInvocation {
    readonly siteId: string;
    readonly contractId: string;
    readonly capabilityId: string;
    readonly input: unknown;
    /** Constructed by the trusted surface; never copied from capability input. */
    readonly origin: GatewayOrigin;
    /** Constructed by a trusted surface from verified authentication. */
    readonly actor: GatewayActor;
}

export interface GatewayRoute {
    readonly selection: ContractSelection;
    readonly release: CatalogueContractRelease;
    readonly manifest: CatalogueProviderManifest;
    readonly installation: StoredProviderInstallation;
    /** A coherent host-owned revision spanning all four records and yank state. */
    readonly revision: string;
}

export interface GatewayRouteResolver {
    resolve(siteId: string, contractId: string): Promise<GatewayRoute | null>;
    isCurrent(route: GatewayRoute): Promise<boolean>;
}

/** Host-owned revision covering selections, installations, observations, releases, manifests, and yanks. */
export interface GatewayRouteRevisionSource {
    capture(siteId: string): Promise<string>;
    isCurrent(siteId: string, revision: string): Promise<boolean>;
}

export interface GatewayTransportRequest {
    readonly requestId: string;
    readonly siteId: string;
    readonly installationId: string;
    readonly endpoint: string;
    readonly providerTokenRef: string;
    readonly release: ContractRelease;
    readonly capability: CapabilityDefinition;
    readonly binding: CompiledHttpBinding;
    readonly input: Readonly<Record<string, unknown>>;
    readonly invocationOrigin: GatewayOrigin;
    readonly actorKind: GatewayActor["kind"];
    readonly providerSubjectId?: string;
}

export interface GatewayTransportResponse {
    readonly status: number;
    readonly contentType?: string;
    readonly output?: unknown;
    readonly bytes?: Uint8Array;
    readonly errorCode?: string;
}

export interface GatewayTransport {
    send(request: GatewayTransportRequest): Promise<GatewayTransportResponse>;
}

interface GatewayResultBase {
    readonly requestId: string;
    readonly status: number;
}

export type GatewayResult =
    | (GatewayResultBase & { readonly kind: "success"; readonly output?: unknown })
    | (GatewayResultBase & {
          readonly kind: "binary";
          readonly bytes: Uint8Array;
          readonly contentType: string;
          readonly media?: ProviderMediaIdentity;
      })
    | (GatewayResultBase & {
          readonly kind: "declared-error";
          readonly errorCode: string;
          readonly output?: unknown;
      });

export interface GatewayInvoker {
    invoke(value: GatewayInvocation): Promise<GatewayResult>;
}

export interface GatewayAccessProbe {
    assertAuthorized(value: Omit<GatewayInvocation, "input">): Promise<void>;
}
