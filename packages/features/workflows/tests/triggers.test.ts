import { expect, test } from "bun:test";
import { domainFixture, document } from "./support/domain";
test("deleting a preparing trigger cancels its uncreated subscription before acknowledging", async () => {
    const f = domainFixture();
    await f.definitions.create("workflow", JSON.stringify(document), "{}");
    await f.definitions.publish("workflow", 1);
    let entered!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => {
        entered = resolve;
    });
    const waiting = new Promise<void>((resolve) => {
        release = resolve;
    });
    let cancelled = false;
    f.services.domainSubscriptions.ensure = async () => {
        entered();
        await waiting;
        if (cancelled) {
            throw new Error("Subscription ID was cancelled");
        }
        return { revision: 1 };
    };
    f.services.domainSubscriptions.remove = async () => {
        cancelled = true;
    };
    const creating = f.triggers.create("trigger", "workflow", 1, "admin");
    await started;
    await f.triggers.remove("trigger", (await f.store.trigger("trigger"))!.revision);
    expect((await f.store.trigger("trigger"))!.state).toBe("deleted");
    release();
    await expect(creating).rejects.toThrow("Subscription ID was cancelled");
    expect((await f.store.trigger("trigger"))!.state).toBe("deleted");
});
