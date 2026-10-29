import type { GatewayActor } from "cms-gateway/invocation/interfaces/Invocation";
import type { DelegationContext } from "cms-gateway/access/delegation/interfaces";
import type { ProviderInvocationIssue } from "./ProviderInvocationToken";

type ProviderDelegationClosure = Readonly<{ ticket: string; requestId: string }>;
export type ProviderDispatchPreparation = Readonly<{
    closedDelegations?: readonly ProviderDelegationClosure[];
    invocation: Omit<ProviderInvocationIssue, "subjectId" | "actorKind" | "delegation">;
    actor: GatewayActor;
    deadline: number;
    expectedSubjectId?: string;
}>;

export type PreparedProviderDispatch = Readonly<{
    token: string;
    instanceId: string;
    delegation: DelegationContext | null;
}>;

/** Opaque Provider credential crosses only the authenticated Edge/control boundary. */
export type ProviderMachinePreparation = Readonly<{
    closedDelegations?: readonly ProviderDelegationClosure[];
    token: string;
    invocation: Omit<
        ProviderInvocationIssue,
        | "subjectId"
        | "actorKind"
        | "delegation"
        | "sourceInstallationId"
        | "sourceCredentialFingerprint"
        | "systemServiceId"
        | "delegatedTicket"
    >;
    deadline: number;
}>;
export type PreparedProviderMachine = PreparedProviderDispatch & Readonly<{ sourceInstallationId: string }>;
