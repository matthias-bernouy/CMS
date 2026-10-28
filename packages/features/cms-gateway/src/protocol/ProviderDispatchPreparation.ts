import type { GatewayActor } from "cms-gateway/invocation/interfaces/Invocation";
import type { DelegationContext } from "cms-gateway/access/delegation/interfaces";
import type { ProviderInvocationIssue } from "./ProviderInvocationToken";

export type ProviderDispatchPreparation = Readonly<{
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
