import { expect, test } from "bun:test";
import {
    ConnectionMutationQueue,
    mutateConnection,
} from "../../../../src/runtime/stores/repository/connectionMutations";
import { InMemorySecretStore } from "@bernouy/secret-store";

test("a saturated or expired credential change cannot execute later or bypass an active mutation", async () => {
    const queue = new ConnectionMutationQueue(1, 15);
    const resume = Promise.withResolvers<void>();
    const events: string[] = [];
    const first = queue.run(async () => {
        await resume.promise;
        events.push("first");
    });
    try {
        const expired = queue.run(async () => {
            events.push("expired");
        });
        await expect(
            queue.run(async () => {
                events.push("overflow");
            }),
        ).rejects.toThrow("capacity");
        await expect(expired).rejects.toThrow("wait expired");
        const next = queue.run(async () => {
            events.push("next");
        });
        expect(events).toEqual([]);
        resume.resolve();
        await Promise.all([first, next]);
        expect(events).toEqual(["first", "next"]);
    } finally {
        resume.resolve();
        await first;
    }
});

test("failed credential changes release the queue and different instances never share a gate", async () => {
    const stores = [new InMemorySecretStore(), new InMemorySecretStore()] as const;
    const scope = crypto.randomUUID();
    const resume = Promise.withResolvers<void>();
    const first = mutateConnection(stores[0], scope, async () => {
        await resume.promise;
        throw new Error("verification refused");
    });
    void first.catch(() => undefined);
    const following = mutateConnection(stores[0], scope, async () => "released");
    try {
        expect(await mutateConnection(stores[1], scope + "-other", async () => "independent")).toBe("independent");
        resume.resolve();
        await expect(first).rejects.toThrow("verification refused");
        expect(await following).toBe("released");
        expect(await mutateConnection(stores[0], scope, async () => "fresh")).toBe("fresh");
    } finally {
        resume.resolve();
        await Promise.allSettled([first, following]);
    }
});
