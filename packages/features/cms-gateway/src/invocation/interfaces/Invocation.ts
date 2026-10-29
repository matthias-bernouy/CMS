import type { GatewayAuthorityReads } from "../core/dispatch/GatewayAuthorityReads";
import type { ResourceMetadata } from "../resource/metadata";
import type { TraceContext } from "@bernouy/logging";
import type { DelegationContext } from "cms-gateway/access/delegation/interfaces";
import type { CapabilityDefinition, ContractRelease } from "@bernouy/cms-repository/contracts";
import type { AdmittedContractRelease } from "@bernouy/cms-repository/contracts";
import type { CatalogueContractRelease } from "@bernouy/cms-repository/contracts/catalogue";
import type { CatalogueProviderManifest } from "@bernouy/cms-repository/providers/catalogue";
import type { StoredProviderInstallation } from "@bernouy/cms-repository/providers/installations";
import type { ContractSelection } from "@bernouy/cms-repository/providers/selections";
import type { ContractParentReference, ReleaseDigest } from "@bernouy/cms-repository/contracts";
import type { GatewayActorCredential, GatewayResponseEffect } from "cms-gateway/protocol/TrustedCapabilityEffects";
export type GatewayActor =
    | { readonly kind: "anonymous" }
    | { readonly kind: "user" | "administrator"; readonly subjectId: string; readonly authorizationRevision?: number }
    | { readonly kind: "provider"; readonly installationId: string; readonly credentialFingerprint: string }
    | { readonly kind: "system"; readonly serviceId: string };

export interface GatewayInvocation {
    readonly trace?: TraceContext;
    readonly siteId: string;
    readonly contractId: string;
    readonly capabilityId: string;
    readonly input: unknown;
    /** Streaming bytes for the single binary input property, kept outside the JSON snapshot. */
    readonly binaryBody?: GatewayBinaryBody;
    /** Optional explicit exposure selected by a trusted protocol adapter. */
    readonly bindingId?: string;
    readonly bindingTransport?: string;
    /** Request binary representation metadata without consuming its content. */
    readonly metadataOnly?: boolean;
    /** Constructed by a trusted surface from verified authentication. */
    readonly actor: GatewayActor;
    /** Required by keyed commands and transported outside authored capability input. */
    readonly idempotencyKey?: string;
    /** Opaque browser credential accepted only by the Access actor resolver. */
    readonly actorCredential?: GatewayActorCredential;
    /** Accepted only together with an authenticated source Provider actor. */
    readonly delegationTicket?: string;
}

interface GatewayBinaryBody {
    readonly stream: ReadableStream<Uint8Array>;
    readonly contentType?: string;
    readonly contentLength?: number;
}

export interface GatewayRoute {
    readonly selection: ContractSelection;
    /** Concrete selected release that pins the approved Provider implementation. */
    readonly release: CatalogueContractRelease;
    /** Exact lineage release that owns the contract requested from the Gateway. */
    readonly requestedRelease: CatalogueContractRelease;
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
    /** With reads, this is a speculative preparation view; the caller must fence live authority before dispatch. */
    resolve(siteId: string, contractId: string, reads?: GatewayAuthorityReads): Promise<GatewayRoute | null>;
    isCurrent(route: GatewayRoute): Promise<boolean>;
}

export interface GatewayTransportRequest {
    /** Host-owned initial reads for this dispatch only. Never serialize as wire authority. */
    readonly authorityReads?: GatewayAuthorityReads;
    readonly actorKind?: "anonymous" | "user" | "administrator";
    readonly trace?: TraceContext;
    readonly delegation?: DelegationContext;
    readonly delegated?: {
        readonly ticket: string;
        readonly sourceInstallationId: string;
        readonly credentialFingerprint: string;
    };
    readonly rootRequestId?: string;
    readonly requestId: string;
    readonly instanceId: string;
    readonly installationId: string;
    readonly endpoint: string;
    readonly providerTokenRef: string;
    readonly release: ContractRelease;
    readonly capability: CapabilityDefinition;
    readonly bindingId?: string;
    readonly bindingTransport?: string;
    readonly metadataOnly?: boolean;
    readonly input: Readonly<Record<string, unknown>>;
    readonly binaryBody?: GatewayBinaryBody;
    /** Provider-scoped opaque user identity, included only when the capability requires one. */
    readonly subjectId?: string;
    readonly systemServiceId?: string;
    readonly sourceInstallationId?: string;
    readonly sourceCredentialFingerprint?: string;
    readonly idempotencyKey?: string;
    readonly actorCredential?: GatewayActorCredential;
}

export interface GatewayTransportResponse {
    readonly resource?: ResourceMetadata;
    readonly status?: number;
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
    readonly status?: number;
    readonly responseHeaders?: Readonly<Record<string, string>>;
    readonly responseEffect?: GatewayResponseEffect;
}

export type GatewayResult =
    | (GatewayResultBase & { readonly kind: "success"; readonly output?: unknown })
    | (GatewayResultBase & {
          readonly kind: "binary";
          readonly resource?: ResourceMetadata;
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
    resolveContract?(value: { siteId: string; contractId: string }): Promise<AdmittedContractRelease>;
}

export interface GatewayAccessProbe {
    assertAuthorized(value: Omit<GatewayInvocation, "input">): Promise<void>;
}
