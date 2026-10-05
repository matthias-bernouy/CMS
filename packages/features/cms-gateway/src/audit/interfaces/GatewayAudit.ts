import type { GatewayActor, GatewayOrigin } from "cms-gateway/invocation/interfaces/Invocation";

export type GatewayCommandAuditStage = "started" | "completed" | "declared-error" | "outcome-unknown";

export interface GatewayCommandAuditEvent {
    readonly id: string;
    readonly requestId: string;
    readonly occurredAt: string;
    readonly siteId: string;
    readonly installationId: string;
    readonly contractId: string;
    readonly capabilityId: string;
    readonly origin: GatewayOrigin;
    readonly actorKind: GatewayActor["kind"];
    readonly actorSubjectId?: string;
    readonly stage: GatewayCommandAuditStage;
    readonly status?: number;
    readonly errorCode?: string;
}

export interface GatewayCommandAuditStore {
    append(event: GatewayCommandAuditEvent): Promise<void>;
}
