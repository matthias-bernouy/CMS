import { expect, test } from "bun:test";
import { renewPrimedDelegation } from "./renew";

test("delegation invalidation primes, closes and refuses the old ticket before issuing a distinct root", async () => {
    const events: string[] = [];
    const source = { requestId: "old-root" };
    let ticket = "old-ticket";
    const target = () => ({
        siteId: "default",
        sourceInstallationId: "owned",
        contractId: "ulvia/cms.installations",
        capabilityId: "initialization.entry",
        ticket,
        sourceCredentialFingerprint: "0".repeat(64),
    });
    const context = {
        source,
        target,
        async issue() {
            events.push("issue");
            expect(source.requestId).not.toBe("old-root");
            ticket = "new-ticket";
        },
        async close() {
            events.push("close");
        },
        check(value: unknown) {
            expect(value).toEqual({ allowed: true });
            events.push("validate");
        },
    };
    const gateway = {
        async checked(capability: string) {
            expect(capability).toBe("gateway.delegation.check");
            events.push("prime");
            return { allowed: true };
        },
        async refused(_capability: string, input: Readonly<Record<string, unknown>>, statuses: number[]) {
            expect(input).toEqual({ target: { ...target(), ticket: "old-ticket" } });
            expect(statuses).toEqual([403]);
            events.push("refused");
        },
    };
    const old = await renewPrimedDelegation(context, gateway);
    expect(old.ticket).toBe("old-ticket");
    expect(target().ticket).toBe("new-ticket");
    expect(events).toEqual(["prime", "validate", "close", "refused", "issue"]);
    ticket = "old-ticket";
    source.requestId = "old-root";
    await expect(renewPrimedDelegation({ ...context, async issue() {} }, gateway)).rejects.toThrow("fresh-ticket");
});
