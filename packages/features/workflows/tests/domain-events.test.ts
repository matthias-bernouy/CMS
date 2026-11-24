import { expect, test } from "bun:test";
import { WorkflowRunner, receiveWorkflowMessage } from "@bernouy/workflows";
import { domainFixture, document, message, context } from "./support/domain";

test("contract events deduplicate receipts and run under the trigger administrator", async () => {
    const f = domainFixture();
    await f.definitions.create("workflow", JSON.stringify(document), "{}");
    await f.definitions.publish("workflow", 1);
    await f.triggers.create("trigger", "workflow", 1, "admin");
    await Promise.all(Array.from({ length: 8 }, () => receiveWorkflowMessage(f.services, message(), context)));
    const page = await f.store.runs(undefined, 100);
    expect(page.items).toHaveLength(1);
    const run = page.items[0]!;
    expect(run.administratorId).toBe("admin");
    const runner = new WorkflowRunner(f.services, { leaseMs: 30000, retryMs: 1, maxAttempts: 3 });
    for (let step = 0; step < 4; step++) {
        await runner.runOne();
    }
    expect((await f.store.run(run.id))!.status).toBe("succeeded");
    expect(f.calls).toHaveLength(1);
    await expect(
        receiveWorkflowMessage(f.services, { ...message(), payloadJson: '{"id":"changed"}' }, context),
    ).rejects.toHaveProperty("code", "DELIVERY_CONFLICT");
});
test("sensitive fields and unguarded optional payload reads fail publication without a plan", async () => {
    for (const change of [
        {
            steps: document.steps.map((step) =>
                step.id === "read"
                    ? { ...step, input: { kind: "object", fields: { id: { kind: "trigger", path: "/data/secret" } } } }
                    : step,
            ),
        },
        { entry: "read", steps: [document.steps[1]] },
    ]) {
        const f = domainFixture();
        await f.definitions.create("workflow", JSON.stringify({ ...document, ...change }), "{}");
        await expect(f.definitions.publish("workflow", 1)).rejects.toHaveProperty("code", "INVALID_DEFINITION");
        expect(await f.store.plan("workflow", 1)).toBeNull();
    }
});
test("foreign delivery authority is refused before inbox or run writes", async () => {
    const f = domainFixture();
    await expect(receiveWorkflowMessage(f.services, message(), { ...context, siteId: "foreign" })).rejects.toThrow();
    expect(f.store.inbox.size).toBe(0);
    expect(f.store.runRecords.size).toBe(0);
});

test("a late delivery from an obsolete trigger generation cannot suspend its repaired replacement", async () => {
    const f = domainFixture();
    await f.definitions.create("old", JSON.stringify(document), "{}");
    await f.definitions.publish("old", 1);
    await f.triggers.create("trigger", "old", 1, "admin");
    Object.assign(f.source, { id: "c".repeat(64), digest: `sha256:${"d".repeat(64)}`, version: "1.1.0" });
    const old = (await f.store.trigger("trigger"))!;
    await f.triggers.revalidate("trigger", old.revision);
    await f.definitions.create("new", JSON.stringify(document), "{}");
    await f.definitions.publish("new", 1);
    const suspended = (await f.store.trigger("trigger"))!;
    f.services.domainSubscriptions.ensure = async () => ({ revision: 3 });
    await f.triggers.update("trigger", suspended.revision, "new", 1, "admin");
    const repaired = await f.store.trigger("trigger");
    expect(repaired!.state).toBe("active");
    expect((await receiveWorkflowMessage(f.services, message(), context)).accepted).toBe(true);
    expect(await f.store.trigger("trigger")).toEqual(repaired);
    expect(f.store.runRecords.size).toBe(0);
    expect(f.store.inbox.has("delivery")).toBe(true);
    expect(f.disabled).toHaveLength(1);
});
