import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { contentMongo } from "../../../../../tests/integration/content/mongo";
import {
    MongoWorkflowInstallations,
    MongoWorkflowStore,
    MongoWorkflowValues,
    workflowUsage,
} from "@bernouy/workflows/mongo";
import { WorkflowInstallations, WorkflowRuns, WorkflowRunner } from "@bernouy/workflows";
import { admitWorkflowManifest } from "@bernouy/workflows/manifest";
import { encryptAesGcm, decryptAesGcm, asBuffer } from "@bernouy/envelope-crypto";
import { definition, fixture } from "../support/fixture";

const enabled = process.env.ULVIA_RUN_WORKFLOWS_MONGO === "1";
describe.skipIf(!enabled)("Workflow installed manifests on standalone Mongo", () => {
    let mongo: Awaited<ReturnType<typeof contentMongo>>;
    beforeAll(async () => {
        mongo = await contentMongo();
    }, 30000);
    afterAll(async () => {
        await mongo?.close();
    }, 30000);
    test("encrypted installation, CAS configuration, immutable publication and removal survive restart", async () => {
        const f = fixture();
        const db = mongo.client.db(`workflow_install_${crypto.randomUUID().replaceAll("-", "")}`);
        const key = Buffer.alloc(32, 9);
        const values = new MongoWorkflowValues(db, {
            encrypt: async (value) => encryptAesGcm(value, key),
            decrypt: async (blob) =>
                decryptAesGcm({ iv: asBuffer(blob.iv), ciphertext: asBuffer(blob.ciphertext) }, key).toString(),
        });
        const store = new MongoWorkflowStore(db, values);
        await store.open();
        const installationStore = await new MongoWorkflowInstallations(db).init();
        const admission = admitWorkflowManifest(
            JSON.stringify({
                kind: "workflow",
                format: "ulvia-workflow-manifest/v1",
                workflowId: "test/orders",
                publisherId: "test",
                version: "1.0.0",
                name: "Orders",
                definition,
                requirements: [
                    {
                        contractId: "test/orders",
                        versionRange: "^1.0.0",
                        capabilityIds: ["orders.read", "orders.notify"],
                        eventIds: [],
                    },
                ],
            }),
        );
        const services = {
            ...f.services,
            store,
            values,
            installationStore,
            artifacts: { read: async () => admission.canonicalJson },
        };
        const installations = new WorkflowInstallations(services);
        const reference = {
            repositoryId: "configured",
            publisherId: "test",
            workflowId: "test/orders",
            version: "1.0.0",
            digest: admission.digest,
        };
        await expect(
            installations.install("bad", { ...reference, digest: `sha256:${"0".repeat(64)}` }, "{}", "admin"),
        ).rejects.toHaveProperty("code", "INVALID_DEFINITION");
        expect(await db.collection("workflow_installations").countDocuments()).toBe(0);
        await installations.install("orders", reference, "{}", "admin");
        expect((await installations.validate("orders", 1)).valid).toBe(true);
        const installed = (await installationStore.get("orders"))!;
        const mark = installationStore.markPublished.bind(installationStore);
        installationStore.markPublished = async () => false;
        await expect(installations.publish("orders", 1)).rejects.toHaveProperty("code", "REVISION_CONFLICT");
        expect(await store.plan(installed.workflowId, 1)).toBeNull();
        expect(await store.plan(installed.workflowId, 1, true)).toBeNull();
        expect((await workflowUsage(db, 10)).targets).toHaveLength(0);
        installationStore.markPublished = mark;
        const confirm = store.confirmInstalledPlan.bind(store);
        store.confirmInstalledPlan = async () => {
            throw new Error("Crash after commit");
        };
        await expect(installations.publish("orders", 1)).rejects.toThrow("Crash after commit");
        expect(await store.plan(installed.workflowId, 1)).toBeNull();
        expect((await installationStore.pending(1))[0]!.pendingPublication).toBe(1);
        expect(await workflowUsage(db, 10)).toMatchObject({ complete: true });
        expect((await workflowUsage(db, 10)).targets).toHaveLength(2);
        store.confirmInstalledPlan = confirm;
        await new WorkflowInstallations(services).get("orders");
        expect((await installationStore.get("orders"))!.pendingPublication).toBeNull();
        const publication = await installations.publish("orders", 1);
        expect(await new WorkflowInstallations(services).publish("orders", 1)).toEqual(publication);
        const original = await store.plan(publication.workflowId, 1);
        const configurations = await Promise.allSettled([
            installations.configure("orders", 1, "{}", "admin"),
            installations.configure("orders", 1, "{}", "admin"),
        ]);
        expect(configurations.filter((result) => result.status === "fulfilled")).toHaveLength(1);
        expect((await installationStore.get("orders"))!.revision).toBe(2);
        await installations.publish("orders", 2);
        expect(await store.plan(publication.workflowId, 1)).toEqual(original);
        const other = await new MongoWorkflowInstallations(mongo.client.db(`${db.databaseName}_foreign`)).init();
        expect(await other.get("orders")).toBeNull();
        const runs = new WorkflowRuns(services);
        await runs.start("accepted", publication.workflowId, 1, "admin", { id: "private-order-id" });
        await installations.remove("orders", 2, "admin");
        expect((await new WorkflowInstallations(services).get("orders")).state).toBe("removed");
        expect(await store.plan(publication.workflowId, 1)).toBeNull();
        for (let index = 0; index < 6; index++) {
            await new WorkflowRunner(services, { leaseMs: 30000, retryMs: 1, maxAttempts: 3 }).runOne();
        }
        expect((await runs.get("accepted")).status).toBe("succeeded");
        expect(JSON.stringify(await db.collection("workflow_value_chunks").find().toArray())).not.toContain(
            "private-order-id",
        );
        expect((await installationStore.list(undefined, 1)).items[0]).not.toHaveProperty("parametersRef");
    });
});
