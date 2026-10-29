import type { TrackedDelegationRoots } from "./dispatch/TrackedDelegationRoots";
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
    constructor(
        private readonly invoke: ControlInvocation,
        private readonly roots?: TrackedDelegationRoots,
    ) {}
    async issue(source: DelegationSource) {
        const reservation = this.roots?.reserve();
        try {
            const response = await this.call("issue", { source });
            if (response.delegation === null) {
                return null;
            }
            const context = response.delegation as Record<string, unknown> | undefined;
            if (!context || !validDelegationTicket(context.ticket) || !Number.isSafeInteger(context.expiresAt)) {
                throw new GatewayError("invalid_provider_response", "invalid delegation response");
            }
            const issued = { ticket: context.ticket, expiresAt: Number(context.expiresAt) };
            await this.trackIssued(issued, source.requestId, source.siteId, reservation);
            return issued;
        } finally {
            this.roots?.releaseReservation(reservation);
        }
    }
    async trackIssued(
        context: { ticket: string; expiresAt: number },
        requestId: string,
        siteId = "default",
        reservation?: symbol,
    ) {
        try {
            this.roots?.register(context, requestId, siteId, reservation);
        } catch (error) {
            // A returned root remains Provider-owned even when local admission fails.
            await this.closeRemote({ siteId, ticket: context.ticket, requestId });
            throw error;
        }
    }
    async check(target: DelegationTarget) {
        if (this.roots && !this.roots.use(target)) {
            throw new GatewayError("not_authorized", "Root invocation is no longer active on this Edge");
        }
        const response = await this.call("check", { target });
        const actor = response.actor as DelegationActor | undefined;
        if (
            !actor ||
            (actor.kind !== "anonymous" && actor.kind !== "user" && actor.kind !== "administrator") ||
            (actor.kind !== "anonymous" &&
                (typeof actor.subjectId !== "string" || !Number.isSafeInteger(actor.authorizationRevision))) ||
            typeof response.rootRequestId !== "string"
        ) {
            throw new GatewayError("invalid_provider_response", "invalid delegated actor");
        }
        if (this.roots && !this.roots.use(target)) {
            throw new GatewayError("not_authorized", "Root closed during delegation inspection");
        }
        return { actor, rootRequestId: response.rootRequestId };
    }
    async close(context: { siteId: string; ticket: string; requestId: string }) {
        if (this.roots && this.roots.close(context) !== "used") {
            return;
        }
        await this.closeRemote(context);
    }
    private async closeRemote(context: { siteId: string; ticket: string; requestId: string }) {
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
        } catch (error) {
            const status = error && typeof error === "object" && "status" in error ? Number(error.status) : 0;
            if (status === 401 || status === 403) {
                throw new GatewayError("not_authorized", "delegation authority rejected the invocation");
            }
            if (status === 429) {
                throw new GatewayError("rate_limited", "delegation authority rate limit exceeded");
            }
            throw new GatewayError("transport_failure", "delegation authority is unavailable");
        }
    }
}
