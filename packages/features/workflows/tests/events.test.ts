import { expect, test } from "bun:test";
import { WorkflowTriggers, WorkflowError, receiveWorkflowMessage } from "@bernouy/workflows";
import { domainFixture, document, message, context } from "./support/domain";
async function active() {
    const f = domainFixture();
    await f.definitions.create("workflow", JSON.stringify(document), "{}");
    await f.definitions.publish("workflow", 1);
    await f.triggers.create("trigger", "workflow", 1, "admin");
    return f;
}
test("incompatible sources suspend new runs with diagnostics, including after receiver restart", async () => {
    const f = await active();
    f.source.retired = true;
    const receipt = await receiveWorkflowMessage(f.services, message(), context);
    expect(receipt.accepted).toBe(true);
    expect(await f.store.trigger("trigger")).toMatchObject({
        state: "suspended",
        diagnostic: { code: "SOURCE_CHANGED", path: "trigger.source" },
    });
    expect(f.disabled).toEqual(["trigger"]);
    expect(f.store.runRecords.size).toBe(0);
    const recreated = new WorkflowTriggers(f.services);
    const head = (await f.store.trigger("trigger"))!;
    f.source.retired = false;
    expect((await recreated.revalidate(head.id, head.revision)).state).toBe("suspended");
    expect((await recreated.update(head.id, head.revision, "workflow", 1, "admin")).state).toBe("active");
    expect(await receiveWorkflowMessage(f.services, message(), context)).toEqual(receipt);
    expect(f.store.runRecords.size).toBe(0);
});
test("transport outages retain the active trigger and delivery remains retryable", async () => {
    const f = await active();
    f.services.contracts.resolveEvent = async () => {
        throw new WorkflowError("CORE_UNAVAILABLE");
    };
    await expect(receiveWorkflowMessage(f.services, message(), context)).rejects.toHaveProperty(
        "code",
        "CORE_UNAVAILABLE",
    );
    expect((await f.store.trigger("trigger"))!.state).toBe("active");
    expect(f.store.inbox.size).toBe(0);
    expect(f.disabled).toEqual([]);
});
test("malformed declared payloads suspend before any business call", async () => {
    const f = await active();
    await receiveWorkflowMessage(f.services, { ...message(), payloadJson: '{"id":123}' }, context);
    expect((await f.store.trigger("trigger"))!.diagnostic).toEqual({
        code: "EVENT_SCHEMA_CHANGED",
        path: "trigger.data",
    });
    expect(f.calls).toEqual([]);
    expect(f.store.runRecords.size).toBe(0);
});
test("failed suspension cleanup recovers while queued deliveries cannot create runs", async () => {
    const f = await active();
    f.source.retired = true;
    f.services.domainSubscriptions.disable = async () => {
        throw new Error("Disconnected");
    };
    const head = (await f.store.trigger("trigger"))!;
    await expect(f.triggers.revalidate(head.id, head.revision)).rejects.toThrow("Disconnected");
    expect((await f.store.trigger(head.id))!.state).toBe("suspending");
    await receiveWorkflowMessage(f.services, message(), context);
    expect(f.store.runRecords.size).toBe(0);
    f.services.domainSubscriptions.disable = async () => ({ revision: 2 });
    await new WorkflowTriggers(f.services).settle((await f.store.trigger(head.id))!);
    expect((await f.store.trigger(head.id))!.state).toBe("suspended");
});

test("unchanged event releases remain active and declaration changes identify the schema", async () => {
    const f = await active();
    Object.assign(f.source, {
        version: "1.1.0",
        declaringContract: { ...f.source.declaringContract, version: "1.1.0", digest: `sha256:${"e".repeat(64)}` },
    });
    let head = (await f.store.trigger("trigger"))!;
    expect((await f.triggers.revalidate(head.id, head.revision)).state).toBe("active");
    Object.assign(f.source, { id: "d".repeat(64), digest: `sha256:${"f".repeat(64)}`, schema: { type: "boolean" } });
    head = (await f.store.trigger("trigger"))!;
    expect((await f.triggers.revalidate(head.id, head.revision)).diagnostic).toEqual({
        code: "SOURCE_CHANGED",
        path: "trigger.source.schema",
    });
});
