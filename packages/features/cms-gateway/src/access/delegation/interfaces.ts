import type { GatewayRoute, GatewayRouteResolver } from "cms-gateway/invocation/interfaces/Invocation";
import type { ContractSelectionStore } from "@bernouy/cms-repository/providers/selections";
import type { GatewayActor } from "cms-gateway/invocation/interfaces/Invocation";

export type DelegationActor = Extract<GatewayActor, { kind: "anonymous" | "user" | "administrator" }>;
export type DelegationContext = Readonly<{ ticket: string; expiresAt: number }>;
export type DelegationSource = Readonly<{
    siteId: string;
    requestId: string;
    installationId: string;
    contractId: string;
    version: string;
    digest: string;
    capabilityId: string;
    actor: DelegationActor;
    deadline: number;
}>;
export type DelegationTarget = Readonly<{
    siteId: string;
    ticket: string;
    sourceInstallationId: string;
    sourceCredentialFingerprint: string;
    contractId: string;
    capabilityId: string;
}>;
export interface GatewayDelegationAuthority {
    issue(source: DelegationSource): Promise<DelegationContext | null>;
    check(
        target: DelegationTarget,
        consume?: boolean,
        bytes?: number,
    ): Promise<
        Readonly<{
            actor: DelegationActor;
            rootRequestId: string;
        }>
    >;
    close(input: { siteId: string; ticket: string; requestId: string }): Promise<void>;
}
export type DelegationRecord = Readonly<{
    hash: string;
    siteId: string;
    source: DelegationSource;
    installationFingerprint: string;
    credentialFingerprint: string;
    selectionFingerprint: string;
    actorFingerprint: string;
    expiresAt: number;
}>;
/** Stores retain only hashes of bearer tickets. Consume and close must be atomic. */
export interface DelegationStore {
    create(record: DelegationRecord, now: number): Promise<boolean>;
    get(siteId: string, hash: string, now: number): Promise<DelegationRecord | null>;
    consume(siteId: string, hash: string, now: number, bytes: number): Promise<boolean>;
    close(siteId: string, hash: string, requestId: string): Promise<void>;
}

export interface DelegationAuthorityOptions {
    readonly siteId: string;
    readonly routes: GatewayRouteResolver;
    readonly selections: Pick<ContractSelectionStore, "get">;
    readonly store: DelegationStore;
    /** Selected Access owns activity and authorization revisions. */
    inspectActor(actor: DelegationActor): Promise<DelegationActor | null>;
    credentialFingerprint(route: GatewayRoute): Promise<string | null>;
    readonly now?: () => number;
}
