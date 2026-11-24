import { createHash } from "node:crypto";
import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { contentMongo } from "../../../../tests/integration/content/mongo";
import { MongoWorkflowStore, MongoWorkflowValues, workflowUsage } from "@bernouy/workflows/mongo";
import { encryptAesGcm, decryptAesGcm, asBuffer } from "@bernouy/envelope-crypto";
import {
    WorkflowDefinitions,
    WorkflowRuns,
    WorkflowRunner,
    WorkflowTriggers,
    receiveWorkflowMessage,
} from "@bernouy/workflows";
import { domainFixture, document, message, context } from "./support/domain";
import { definition, fixture } from "./support/fixture";
const enabled = process.env.ULVIA_RUN_WORKFLOWS_MONGO === "1";
describe.skipIf(!enabled)("Workflow standalone Mongo durability", () => {
    let mongo: Awaited<ReturnType<typeof contentMongo>>;
    beforeAll(async () => {
        mongo = await contentMongo();
    }, 30000);
    afterAll(async () => {
        await mongo?.close();
    }, 30000);
    const setup = async () => {
        const f = domainFixture();
        const db = mongo.client.db(`workflow_${crypto.randomUUID().replaceAll("-", "")}`);
        const key = Buffer.alloc(32, 7);
        const cipher = {
            encrypt: async (value: string) => encryptAesGcm(value, key),
            decrypt: async (blob: Parameters<typeof decryptAesGcm>[0]) =>
                decryptAesGcm({ iv: asBuffer(blob.iv), ciphertext: asBuffer(blob.ciphertext) }, key).toString(),
        };
        const values = new MongoWorkflowValues(db, cipher);
        const store = new MongoWorkflowStore(db, values);
        await store.open();
        const services = { ...f.services, values, store };
        return {
            ...f,
            db,
            services,
            store,
            values,
            definitions: new WorkflowDefinitions(services),
            runs: new WorkflowRuns(services),
        };
    };
    test("encrypted immutable values, restart checkpoints, pagination and upgrade references", async () => {
        const f = await setup();
        await f.definitions.create("orders", JSON.stringify(definition), "{}");
        await f.definitions.publish("orders", 1);
        for (const id of ["a", "b", "c"]) {
            await f.runs.start(id, "orders", 1, "admin", { id: "customer-secret" });
        }
        const page = await f.store.runs(undefined, 2);
        expect(page.items.map(({ id }) => id)).toEqual(["a", "b"]);
        expect((await f.store.runs(page.nextCursor, 2)).items.map(({ id }) => id)).toEqual(["c"]);
        for (let count = 0; count < 20; count++) {
            await new WorkflowRunner(f.services, { leaseMs: 30000, retryMs: 1, maxAttempts: 3 }).runOne();
        }
        expect((await f.runs.get("a")).status).toBe("succeeded");
        expect(f.calls).toHaveLength(6);
        const raw = await f.db.collection("workflow_value_chunks").find().toArray();
        expect(JSON.stringify(raw)).not.toContain("customer-secret");
        const ref = await f.values.put("a", "immutable", { secret: true });
        await expect(f.values.get("b", ref)).rejects.toHaveProperty("code", "CORE_UNAVAILABLE");
        await expect(f.values.put("a", "immutable", false)).rejects.toHaveProperty("code", "VALUE_CONFLICT");
        expect((await workflowUsage(f.db, 100)).targets).toHaveLength(2);
        await f.definitions.retire("orders", 1);
        expect((await workflowUsage(f.db, 100)).targets).toEqual([]);
        const first = await f.store.claim(f.services.now(), "none", f.services.now() + 10);
        expect(first).toBeNull();
    });
    test("an atomic run receipt survives duplicate delivery, changed bytes, retirement and cross-instance attempts", async () => {
        const f = await setup();
        const triggered = document;
        await f.definitions.create("triggered", JSON.stringify(triggered), "{}");
        await f.definitions.publish("triggered", 1);
        await new WorkflowTriggers(f.services).create("trigger", "triggered", 1, "admin");
        const event = message();
        const receipts = await Promise.all(
            Array.from({ length: 12 }, () => receiveWorkflowMessage(f.services, event, context)),
        );
        expect(receipts.every(({ accepted }) => accepted)).toBe(true);
        expect(await f.db.collection("workflow_runs").countDocuments()).toBe(1);
        await expect(
            receiveWorkflowMessage(f.services, Object.assign({}, event, { errorCode: "INVALID" }), context),
        ).rejects.toThrow();
        await expect(
            receiveWorkflowMessage(f.services, { ...event, occurredAt: "2026-11-23T12:00:00Z" }, context),
        ).rejects.toHaveProperty("code", "DELIVERY_CONFLICT");
        const other = await setup();
        await expect(receiveWorkflowMessage(other.services, event, context)).rejects.toHaveProperty(
            "code",
            "FORBIDDEN",
        );
        expect(await other.db.collection("workflow_runs").countDocuments()).toBe(0);
        await expect(receiveWorkflowMessage(f.services, event, { ...context, siteId: "foreign" })).rejects.toThrow();
        await f.definitions.retire("triggered", 1);
        expect(await receiveWorkflowMessage(f.services, event, context)).toEqual(receipts[0]!);
        await receiveWorkflowMessage(f.services, { ...event, deliveryId: "retired-delivery" }, context);
        expect((await f.store.runs(undefined, 100)).items).toHaveLength(1);
    });
    test("expired leases reject stale checkpoints and leave failed runs in the usage inventory", async () => {
        const f = await setup();
        await f.definitions.create("orders", JSON.stringify(definition), "{}");
        await f.definitions.publish("orders", 1);
        await f.runs.start("run", "orders", 1, "admin", { id: "order" });
        const now = f.services.now();
        const first = (await f.store.claim(now, "first", now + 10))!;
        const second = (await f.store.claim(now + 11, "second", now + 21))!;
        expect(
            await f.store.checkpoint(
                { ...first, revision: first.revision + 1, status: "succeeded" },
                first.revision,
                "first",
                now + 11,
            ),
        ).toBe(false);
        const { lease: _lease, ...rest } = second;
        expect(
            await f.store.checkpoint(
                { ...rest, revision: second.revision + 1, status: "failed" },
                second.revision,
                "second",
                now + 12,
            ),
        ).toBe(true);
        await f.definitions.retire("orders", 1);
        expect((await workflowUsage(f.db, 100)).targets).toHaveLength(2);
    });
    test("a suspended accepted run retains upgrade references after its publication is retired", async () => {
        const f = await setup();
        await f.definitions.create("orders", JSON.stringify(definition), "{}");
        await f.definitions.publish("orders", 1);
        await f.runs.start("suspended", "orders", 1, "admin", { id: "order" });
        Object.assign(f.capabilities["orders.read"]!.capability, { output: { type: "boolean" } });
        await new WorkflowRunner(f.services, { leaseMs: 30000, retryMs: 1, maxAttempts: 3 }).runOne();
        expect((await f.runs.get("suspended")).status).toBe("suspended");
        await f.definitions.retire("orders", 1);
        expect((await workflowUsage(f.db, 100)).targets).toHaveLength(2);
    });
    test("seven-day run purges resume after interruption, preserve live scopes and keep only deduplication receipts", async () => {
        const f = await setup();
        await f.definitions.create("orders", JSON.stringify(definition), "{}");
        await f.definitions.publish("orders", 1);
        const now = f.services.now();
        const runId = `event:${createHash("sha256").update("retained-delivery").digest("hex")}`;
        const prepared = await f.runs.prepare(runId, "orders", 1, "admin", { id: "private-order" });
        await f.store.acceptEvent({ deliveryId: "retained-delivery" }, "receipt-fingerprint", prepared);
        const accepted = (await f.store.run(runId))!;
        const resultRef = await f.values.put(runId, "output", { secret: "private-result" });
        await f.store.checkpoint(
            {
                ...accepted,
                resultRef,
                status: "succeeded",
                currentStep: null,
                revision: accepted.revision + 1,
                updatedAt: new Date(now).toISOString(),
            },
            accepted.revision,
            undefined,
            now,
        );
        for (const [id, status] of [
            ["active", "queued"],
            ["waiting", "waiting"],
            ["suspended", "suspended"],
            ["uncertain", "outcomeUnknown"],
            ["resumed", "failed"],
        ] as const) {
            const run = await f.runs.start(id, "orders", 1, "admin", { id: "live-order" });
            await f.store.checkpoint({ ...run, status, revision: run.revision + 1 }, run.revision, undefined, now);
        }
        const failed = (await f.store.run("resumed"))!;
        await f.runs.resume("resumed", failed.revision, "admin", "retry");
        expect(await f.store.purgeRuns(now + 604800000 - 1, 1)).toBe(0);
        const purge = f.values.purge.bind(f.values);
        f.values.purge = async (id, limit) => {
            await purge(id, limit);
            throw new Error("Crash before tombstone");
        };
        await expect(f.store.purgeRuns(now + 604800000, 1)).rejects.toThrow("Crash before tombstone");
        expect(await f.store.run(runId)).toBeNull();
        await expect(f.values.put(runId, "late-output", { secret: "late" })).rejects.toHaveProperty(
            "code",
            "INVALID_STATE",
        );
        expect(
            await f.store.checkpoint(
                { ...accepted, status: "queued", revision: accepted.revision + 1 },
                accepted.revision,
                undefined,
                now + 604800000,
            ),
        ).toBe(false);
        f.values.purge = purge;
        const reopened = new MongoWorkflowStore(f.db, f.values);
        expect(await reopened.purgeRuns(now + 604800000, 1)).toBe(1);
        expect(await f.db.collection("workflow_values").countDocuments({ runId })).toBe(0);
        expect(await f.db.collection("workflow_value_chunks").countDocuments({ runId })).toBe(0);
        expect(await reopened.eventReceipt("retained-delivery")).toBe("receipt-fingerprint");
        const tombstone = await f.db.collection("workflow_runs").findOne({ _id: runId });
        expect(Object.keys(tombstone!).sort()).toEqual(["_id", "discarded", "expiresAt", "purging", "receipt"]);
        expect(tombstone!.expiresAt.getTime()).toBe(Date.parse(prepared.createdAt) + 2592000000);
        for (const id of ["active", "waiting", "suspended", "uncertain", "resumed"]) {
            const run = (await reopened.run(id))!;
            expect(run).not.toBeNull();
            expect(await f.values.get(id, run.inputRef)).toEqual({ id: "live-order" });
        }
        expect(await reopened.purgeRuns(now + 604800000, 1)).toBe(0);
    });
    test("unregistered seven-day preparations are purged with an atomic identity fence while accepted runs survive", async () => {
        const f = await setup();
        await f.definitions.create("orders", JSON.stringify(definition), "{}");
        await f.definitions.publish("orders", 1);
        const pending = await f.runs.prepare("orphan", "orders", 1, "admin", { id: "unaccepted" });
        await f.values.put("orphan-chunks", "input", { private: "unrooted" });
        await f.db.collection("workflow_values").deleteMany({ runId: "orphan-chunks" });
        const accepted = await f.runs.start("accepted-live", "orders", 1, "admin", { id: "accepted" });
        const now = Date.now();
        // Simulate an interrupted post-insert accepted-scope update too.
        await f.db
            .collection("workflow_value_scopes")
            .updateMany({}, { $set: { accepted: false, createdAt: new Date(now - 604800000) } });
        expect(await f.store.purgeOrphans(now - 1, 10)).toBe(0);
        const purge = f.values.purge.bind(f.values);
        let interrupted = false;
        f.values.purge = async (id, limit) => {
            if (id === "orphan" && !interrupted) {
                interrupted = true;
                await expect(f.store.createRun(pending)).rejects.toHaveProperty("code", "RUN_CONFLICT");
                await expect(f.values.put(id, "late", true)).rejects.toHaveProperty("code", "INVALID_STATE");
                throw new Error("Crash after orphan identity reservation");
            }
            return purge(id, limit);
        };
        await expect(f.store.purgeOrphans(now, 10)).rejects.toThrow("Crash after orphan identity reservation");
        expect((await f.db.collection("workflow_runs").findOne({ _id: "orphan" }))!.orphanPurgePending).toBe(true);
        f.values.purge = purge;
        const reopened = new MongoWorkflowStore(f.db, f.values);
        await reopened.purgeOrphans(now, 10);
        expect(
            await f.db.collection("workflow_values").countDocuments({ runId: { $in: ["orphan", "orphan-chunks"] } }),
        ).toBe(0);
        expect(
            await f.db
                .collection("workflow_value_chunks")
                .countDocuments({ runId: { $in: ["orphan", "orphan-chunks"] } }),
        ).toBe(0);
        expect(
            await f.db
                .collection("workflow_value_scopes")
                .countDocuments({ _id: { $in: ["orphan", "orphan-chunks"] } }),
        ).toBe(0);
        expect(await reopened.run("accepted-live")).not.toBeNull();
        expect(await f.values.get("accepted-live", accepted.inputRef)).toEqual({ id: "accepted" });
        expect((await f.db.collection("workflow_value_scopes").findOne({ _id: "accepted-live" }))!.accepted).toBe(true);
        expect((await f.db.collection("workflow_runs").findOne({ _id: "orphan" }))!.orphanPurgePending).toBeUndefined();
    });
});
