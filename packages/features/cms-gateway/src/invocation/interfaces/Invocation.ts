import type { CapabilityDefinition, ContractRelease } from "@bernouy/cms-repository/contracts";
import type { CompiledHttpBinding } from "@bernouy/cms-repository/contracts/bindings";
import type { CatalogueContractRelease } from "@bernouy/cms-repository/contracts/catalogue";
import type { CatalogueProviderManifest } from "@bernouy/cms-repository/providers/catalogue";
import type { StoredProviderInstallation } from "@bernouy/cms-repository/providers/installations";
import type { ContractSelection } from "@bernouy/cms-repository/providers/selections";
import type { GatewayExecutionPin } from "cms-gateway/execution/interfaces/PageExecution";

export type GatewayActor =
    | { readonly kind: "anonymous" }
    | { readonly kind: "user" | "administrator"; readonly subjectId: string }
    | { readonly kind: "provider"; readonly installationId: string }
    | { readonly kind: "system"; readonly serviceId: string };

export type GatewayOrigin = "delivery" | "page" | "control" | "provider" | "system" | "conformance";

export interface GatewayInvocation {
    readonly siteId: string;
    readonly contractId: string;
    readonly capabilityId: string;
    readonly input: unknown;
    /** Streaming body kept outside the JSON input snapshot. Its property is fixed by the admitted binding. */
    readonly binaryBody?: GatewayBinaryBody;
    /** Trusted HTTP transport override used only for automatic HEAD on binary GET resources. */
    readonly httpMethod?: "HEAD";
    /** Constructed by the trusted surface; never copied from capability input. */
    readonly origin: GatewayOrigin;
    /** Constructed by a trusted surface from verified authentication. */
    readonly actor: GatewayActor;
    /** Required by keyed commands and transported outside authored capability input. */
    readonly idempotencyKey?: string;
    /** Required for collection Page calls; constructed from a current CMS-owned execution grant. */
    readonly execution?: GatewayExecutionPin;
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
}

export interface GatewayRouteResolver {
    resolve(siteId: string, contractId: string): Promise<GatewayRoute | null>;
    isCurrent(route: GatewayRoute): Promise<boolean>;
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
    readonly binaryBody?: GatewayBinaryBody;
    readonly invocationOrigin: GatewayOrigin;
    readonly actorKind: GatewayActor["kind"];
    /** Verified source installation for provider-origin calls. */
    readonly providerInstallationId?: string;
    readonly providerSubjectId?: string;
    readonly idempotencyKey?: string;
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
}

export interface GatewayTransport {
    send(request: GatewayTransportRequest): Promise<GatewayTransportResponse>;
}

interface GatewayResultBase {
    readonly requestId: string;
    readonly status: number;
    readonly responseHeaders?: Readonly<Record<string, string>>;
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
