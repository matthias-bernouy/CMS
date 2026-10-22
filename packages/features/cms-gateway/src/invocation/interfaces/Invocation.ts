import type { CapabilityDefinition, ContractRelease } from "@bernouy/cms-repository/contracts";
import type { CompiledHttpBinding } from "@bernouy/cms-repository/contracts/bindings";
import type { CatalogueContractRelease } from "@bernouy/cms-repository/contracts/catalogue";
import type { CatalogueProviderManifest } from "@bernouy/cms-repository/providers/catalogue";
import type { StoredProviderInstallation } from "@bernouy/cms-repository/providers/installations";
import type { ContractSelection } from "@bernouy/cms-repository/providers/selections";
import type { ContractParentReference, ReleaseDigest } from "@bernouy/cms-repository/contracts";
import type { GatewayActorCredential, GatewayResponseEffect } from "cms-gateway/protocol/TrustedCapabilityEffects";
export type GatewayActor =
    | { readonly kind: "anonymous" }
    | { readonly kind: "user" | "administrator"; readonly subjectId: string }
    | { readonly kind: "provider"; readonly installationId: string }
    | { readonly kind: "system"; readonly serviceId: string };

export interface GatewayInvocation {
    readonly siteId: string;
    readonly contractId: string;
    readonly capabilityId: string;
    readonly input: unknown;
    /** Streaming body kept outside the JSON input snapshot. Its property is fixed by the admitted binding. */
    readonly binaryBody?: GatewayBinaryBody;
    /** Trusted HTTP transport override used only for automatic HEAD on binary GET resources. */
    readonly httpMethod?: "HEAD";
    /** Constructed by a trusted surface from verified authentication. */
    readonly actor: GatewayActor;
    /** Required by keyed commands and transported outside authored capability input. */
    readonly idempotencyKey?: string;
    /** Opaque browser credential accepted only by the Access actor resolver. */
    readonly actorCredential?: GatewayActorCredential;
}

interface GatewayBinaryBody {
    readonly stream: ReadableStream<Uint8Array>;
    readonly contentType?: string;
    readonly contentLength?: number;
}

export interface GatewayRoute {
    readonly selection: ContractSelection;
    readonly release: CatalogueContractRelease;
    readonly manifest: CatalogueProviderManifest;
    readonly installation: StoredProviderInstallation;
    /** Concrete release first; compact exact ancestry used to resolve parent contract calls. */
    readonly lineage: readonly GatewayContractLineageEntry[];
}

export interface GatewayContractLineageEntry {
    readonly contractId: string;
    readonly version: string;
    readonly digest: ReleaseDigest;
    readonly name: string;
    readonly capabilityIds: readonly string[];
    readonly extends?: ContractParentReference;
}

export interface GatewayRouteResolver {
    resolve(siteId: string, contractId: string): Promise<GatewayRoute | null>;
    isCurrent(route: GatewayRoute): Promise<boolean>;
}

export interface GatewayTransportRequest {
    readonly requestId: string;
    readonly instanceId: string;
    readonly installationId: string;
    readonly endpoint: string;
    readonly providerTokenRef: string;
    readonly release: ContractRelease;
    readonly capability: CapabilityDefinition;
    readonly binding: CompiledHttpBinding;
    readonly input: Readonly<Record<string, unknown>>;
    readonly binaryBody?: GatewayBinaryBody;
    /** Provider-scoped opaque user identity, included only when the capability requires one. */
    readonly subjectId?: string;
    readonly idempotencyKey?: string;
    readonly actorCredential?: GatewayActorCredential;
}

export interface GatewayTransportResponse {
    readonly status: number;
    readonly contentType?: string;
    readonly responseHeaders?: Readonly<Record<string, string>>;
    readonly output?: unknown;
    readonly bytes?: Uint8Array;
    readonly stream?: ReadableStream<Uint8Array>;
    readonly contentLength?: number;
    readonly errorCode?: string;
    readonly responseEffect?: GatewayResponseEffect;
}

export interface GatewayTransport {
    send(request: GatewayTransportRequest): Promise<GatewayTransportResponse>;
}

interface GatewayResultBase {
    readonly requestId: string;
    readonly status: number;
    readonly responseHeaders?: Readonly<Record<string, string>>;
    readonly responseEffect?: GatewayResponseEffect;
}

export type GatewayResult =
    | (GatewayResultBase & { readonly kind: "success"; readonly output?: unknown })
    | (GatewayResultBase & {
          readonly kind: "binary";
          readonly stream: ReadableStream<Uint8Array>;
          readonly contentType: string;
          readonly contentLength?: number;
      })
    | (GatewayResultBase & {
          readonly kind: "declared-error";
          readonly errorCode: string;
          readonly retryable: boolean;
          readonly output?: unknown;
      });

export interface GatewayInvoker {
    invoke(value: GatewayInvocation): Promise<GatewayResult>;
    resolveHttp(value: GatewayHttpRouteRequest): Promise<GatewayHttpRoute>;
}

export interface GatewayHttpRouteRequest {
    readonly siteId: string;
    readonly contractId: string;
    readonly method: string;
    /** Path relative to the contract ID, beginning with a slash. */
    readonly path: string;
}

export interface GatewayHttpRoute {
    readonly capability: CapabilityDefinition;
    readonly binding: CompiledHttpBinding;
    readonly pathValues: Readonly<Record<string, string>>;
}

export interface GatewayAccessProbe {
    assertAuthorized(value: Omit<GatewayInvocation, "input">): Promise<void>;
}
