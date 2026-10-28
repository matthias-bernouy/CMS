import type {
    GatewayDelegationAuthority,
    DelegationSource,
    DelegationTarget,
    DelegationActor,
} from "@bernouy/cms-gateway/access/delegation";
import { validDelegationTicket } from "@bernouy/cms-gateway/access/delegation";
import { GatewayError } from "@bernouy/cms-gateway";

type ControlInvocation = (
    id: string,
    method: "POST" | "QUERY",
    path: string,
    input: unknown,
) => Promise<Record<string, unknown> | null>;

export class ControlDelegationAuthority implements GatewayDelegationAuthority {
    constructor(private readonly invoke: ControlInvocation) {}
    async issue(source: DelegationSource) {
        const response = await this.call("issue", { source });
        if (response.delegation === null) {
            return null;
        }
        const context = response.delegation as Record<string, unknown> | undefined;
        if (!context || !validDelegationTicket(context.ticket) || !Number.isSafeInteger(context.expiresAt)) {
            throw new GatewayError("not_authorized", "invalid delegation response");
        }
        return { ticket: context.ticket, expiresAt: Number(context.expiresAt) };
    }
    async check(target: DelegationTarget) {
        const response = await this.call("check", { target });
        const actor = response.actor as DelegationActor | undefined;
        if (
            !actor ||
            (actor.kind !== "anonymous" && actor.kind !== "user" && actor.kind !== "administrator") ||
            (actor.kind !== "anonymous" &&
                (typeof actor.subjectId !== "string" || !Number.isSafeInteger(actor.authorizationRevision))) ||
            typeof response.rootRequestId !== "string"
        ) {
            throw new GatewayError("not_authorized", "invalid delegated actor");
        }
        return { actor, rootRequestId: response.rootRequestId };
    }
    async close(context: { siteId: string; ticket: string; requestId: string }) {
        const response = await this.call("close", { context });
        if (response.accepted !== true) {
            throw new Error("Invalid delegation closure acknowledgement");
        }
    }
    private async call(action: "issue" | "check" | "close", input: unknown) {
        try {
            const response = await this.invoke(
                `gateway.delegation.${action}`,
                action === "check" ? "QUERY" : "POST",
                `/gateway/delegations/${action}`,
                input,
            );
            if (!response) {
                throw new Error("Empty delegation response");
            }
            return response;
        } catch {
            throw new GatewayError("not_authorized", "delegation authority rejected the invocation");
        }
    }
}
