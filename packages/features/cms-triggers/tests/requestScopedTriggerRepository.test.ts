import { describe, expect, test } from "bun:test";
import { InMemoryTriggerRepository, type TriggerRecord } from "@bernouy/cms-triggers";
import { RequestScopedTriggerRepository } from "@bernouy/cms-triggers/requestScope";
import { trigger } from "./helpers/triggerFixtures";

describe("RequestScopedTriggerRepository", () => {
    test("single-flights matching trigger reads and returns defensive clones", async () => {
        const inner = new CountingTriggerRepository();
        await inner.createTrigger(
            trigger({ event: { kind: "endpoint", phase: "request", source: "orders", endpoint: "create" } }),
        );
        const scoped = new RequestScopedTriggerRepository(inner);

        const reads = await Promise.all(
            Array.from({ length: 5 }, () => scoped.findEndpointTriggers!("orders", "create")),
        );
        reads[0]![0]!.enabled = false;
        expect((await scoped.findEndpointTriggers!("orders", "create"))[0]!.enabled).toBe(true);
        expect(inner.endpointReads).toBe(1);
    });

    test("evicts failures, caches null, and invalidates after a mutation", async () => {
        const inner = new CountingTriggerRepository();
        const stored = await inner.createTrigger(trigger({}));
        const scoped = new RequestScopedTriggerRepository(inner);
        inner.rejectGetOnce = true;

        await expect(scoped.getTrigger(stored.id)).rejects.toThrow("transient");
        expect((await scoped.getTrigger(stored.id))?.id).toBe(stored.id);
        await Promise.all([scoped.getTrigger("missing"), scoped.getTrigger("missing")]);
        expect(inner.triggerReads).toBe(3);

        await scoped.setEnabled(stored.id, false);
        expect((await scoped.getTrigger(stored.id))?.enabled).toBe(false);
        expect(inner.triggerReads).toBe(4);
    });
});

class CountingTriggerRepository extends InMemoryTriggerRepository {
    endpointReads = 0;
    triggerReads = 0;
    rejectGetOnce = false;

    override async findEndpointTriggers(source: string, endpoint: string): Promise<TriggerRecord[]> {
        this.endpointReads++;
        return super.findEndpointTriggers(source, endpoint);
    }

    override async getTrigger(id: string): Promise<TriggerRecord | null> {
        this.triggerReads++;
        if (this.rejectGetOnce) {
            this.rejectGetOnce = false;
            throw new Error("transient");
        }
        return super.getTrigger(id);
    }
}
