import { GatewayError } from "@bernouy/cms-gateway";
import type { DelegationContext, DelegationTarget } from "@bernouy/cms-gateway/access/delegation";

type Closure = { siteId: string; ticket: string; requestId: string };
type Root = Closure & { expiresAt: number; used: boolean };

/** One Edge process owns root liveness; no Provider claim can mark a completed root active. */
export class TrackedDelegationRoots {
    private readonly active = new Map<string, Root>();
    private readonly closed = new Map<string, Root>();
    private readonly inFlight = new Set<string>();
    private readonly reservations = new Set<symbol>();
    constructor(
        private readonly now = Date.now,
        private readonly maximum = 256,
    ) {}
    reserve(releasing: readonly Omit<Closure, "siteId">[] = []): symbol {
        this.prune();
        const credit = new Set(
            releasing
                .filter(
                    (item) =>
                        this.inFlight.has(item.ticket) && this.closed.get(item.ticket)?.requestId === item.requestId,
                )
                .map((item) => item.ticket),
        ).size;
        if (
            this.reservations.size >= this.maximum ||
            this.active.size + this.closed.size + this.reservations.size >= this.maximum + credit
        ) {
            throw new GatewayError("rate_limited", "Delegation tracking capacity exceeded");
        }
        const reservation = Symbol();
        this.reservations.add(reservation);
        return reservation;
    }
    releaseReservation(reservation: symbol | undefined): void {
        if (reservation !== undefined) {
            this.reservations.delete(reservation);
        }
    }
    register(context: DelegationContext, requestId: string, siteId = "default", reservation?: symbol): void {
        this.prune();
        if (
            context.expiresAt <= this.now() ||
            (reservation !== undefined && !this.reservations.has(reservation)) ||
            this.active.size + this.closed.size + this.reservations.size - (reservation !== undefined ? 1 : 0) >=
                this.maximum ||
            this.active.has(context.ticket) ||
            this.closed.has(context.ticket)
        ) {
            throw new GatewayError("not_authorized", "Root tracking capacity or lifetime exceeded");
        }
        this.releaseReservation(reservation);
        this.active.set(context.ticket, { ...context, requestId, siteId, used: false });
    }
    use(target: Pick<DelegationTarget, "ticket" | "siteId">): boolean {
        this.prune();
        const root = this.active.get(target.ticket);
        if (!root || root.siteId !== target.siteId) {
            return false;
        }
        root.used = true;
        return true;
    }
    close(context: Closure): "used" | "unused" | "unknown" {
        this.prune();
        const root = this.active.get(context.ticket);
        if (!root || root.siteId !== context.siteId || root.requestId !== context.requestId) {
            return "unknown";
        }
        this.active.delete(root.ticket);
        if (root.used) {
            return "used";
        }
        this.closed.set(root.ticket, root);
        return "unused";
    }
    batch(): readonly Omit<Closure, "siteId">[] {
        this.prune();
        const batch = [...this.closed.values()].filter((root) => !this.inFlight.has(root.ticket)).slice(0, 64);
        for (const root of batch) {
            this.inFlight.add(root.ticket);
        }
        return batch.map(({ ticket, requestId }) => ({ ticket, requestId }));
    }
    release(batch: readonly Omit<Closure, "siteId">[]): void {
        for (const item of batch) {
            if (this.closed.get(item.ticket)?.requestId === item.requestId) {
                this.inFlight.delete(item.ticket);
            }
        }
    }
    acknowledge(batch: readonly Omit<Closure, "siteId">[]): void {
        for (const item of batch) {
            if (this.closed.get(item.ticket)?.requestId === item.requestId) {
                this.closed.delete(item.ticket);
                this.inFlight.delete(item.ticket);
            }
        }
    }
    private prune(): void {
        for (const entries of [this.active, this.closed]) {
            for (const [ticket, root] of entries) {
                if (root.expiresAt <= this.now()) {
                    entries.delete(ticket);
                    this.inFlight.delete(ticket);
                }
            }
        }
    }
}
