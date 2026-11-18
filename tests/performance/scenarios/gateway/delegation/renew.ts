import { assertCondition } from "../../queries/types";
import type { DelegationContext } from "./context";
import type { GatewayContext } from "../context";

type RenewalPort = Readonly<{
    source: { requestId: string };
    issue(): Promise<void>;
    close(): Promise<void>;
    target(): ReturnType<DelegationContext["target"]>;
    check(value: unknown): void;
}>;

/** Invalidate an observed ticket, then measure a fresh root; the closed root must never regain authority. */
export async function renewPrimedDelegation(
    context: RenewalPort,
    gateway: Pick<GatewayContext, "checked" | "refused">,
) {
    const old = { ...context.target() };
    context.check(await gateway.checked("gateway.delegation.check", { target: old }));
    await context.close();
    await gateway.refused("gateway.delegation.check", { target: old }, [403]);
    context.source.requestId = crypto.randomUUID();
    await context.issue();
    assertCondition(context.target().ticket !== old.ticket, "delegation-invalidation-fresh-ticket");
    return old;
}
