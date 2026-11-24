import { expect, test } from "bun:test";
import { WorkflowInstallations } from "@bernouy/workflows";
import { admitWorkflowManifest, verifyStoredWorkflowManifest } from "@bernouy/workflows/manifest";
import example from "../../examples/contact-notification/definition.json";
import { definition, fixture } from "../support/fixture";
function setup() {
    const f = fixture();
    const admission = admitWorkflowManifest(
        JSON.stringify({
            kind: "workflow",
            format: "ulvia-workflow-manifest/v1",
            workflowId: "test/orders",
            publisherId: "test",
            version: "1.0.0",
            name: "Order notifications",
            requirements: [
                {
                    contractId: "test/orders",
                    versionRange: "^1.0.0",
                    capabilityIds: ["orders.read", "orders.notify"],
                    eventIds: [],
                },
            ],
            definition,
        }),
    );
    f.services.artifacts.read = async () => admission.canonicalJson;
    const reference = {
        repositoryId: "configured",
        publisherId: "test",
        workflowId: "test/orders",
        version: "1.0.0",
        digest: admission.digest,
    };
    return { ...f, reference, admission, installations: new WorkflowInstallations(f.services) };
}
test("portable manifest examples admit canonically and undeclared dependencies or scripts are refused", () => {
    const admission = admitWorkflowManifest(JSON.stringify(example));
    expect(verifyStoredWorkflowManifest(admission.canonicalJson, admission.digest)).toEqual(admission);
    expect(() => verifyStoredWorkflowManifest(JSON.stringify(example, null, 2), admission.digest)).toThrow();
    expect(() => admitWorkflowManifest(JSON.stringify({ ...example, requirements: [] }))).toThrow();
    expect(() => admitWorkflowManifest(JSON.stringify({ ...example, script: "fetch('/secret')" }))).toThrow();
    expect(() => admitWorkflowManifest(JSON.stringify({ ...example, publisherId: "foreign" }))).toThrow();
});
test("installed packages validate selected dependencies and publish isolated immutable plans", async () => {
    const f = setup();
    const record = await f.installations.install("orders", f.reference, "{}", "admin");
    expect(record.state).toBe("installed");
    expect((await f.installations.validate("orders", 1)).valid).toBe(true);
    const publication = await f.installations.publish("orders", 1);
    const plan = await f.store.plan(publication.workflowId, 1);
    expect(plan!.parameters).toEqual({});
    expect(await f.installations.publish("orders", 1)).toEqual(publication);
    const next = await f.installations.configure("orders", 1, "{}", "admin");
    expect(next.revision).toBe(2);
    await f.installations.publish("orders", 2);
    expect(await f.store.plan(publication.workflowId, 1)).toEqual(plan);
    await expect(
        f.installations.configure("orders", 2, "{}", "admin", { ...f.reference, publisherId: "foreign" }),
    ).rejects.toHaveProperty("code", "INVALID_INPUT");
    expect((await f.installations.get("orders")).revision).toBe(2);
    await expect(f.definitions.create(publication.workflowId, JSON.stringify(definition), "{}")).rejects.toHaveProperty(
        "code",
        "INVALID_INPUT",
    );
});
test("integrity refusals precede installation writes and pending removals resume after restart", async () => {
    const f = setup();
    await expect(
        f.installations.install("orders", { ...f.reference, digest: `sha256:${"0".repeat(64)}` }, "{}", "admin"),
    ).rejects.toThrow();
    expect((await f.services.installationStore.list(undefined, 100)).items).toEqual([]);
    expect(f.store.values.size).toBe(0);
    await f.installations.install("orders", f.reference, "{}", "admin");
    const publication = await f.installations.publish("orders", 1);
    await f.runs.start("accepted", publication.workflowId, 1, "admin", { id: "order" });
    f.revoke();
    await expect(f.installations.remove("orders", 1, "admin")).rejects.toHaveProperty("code", "FORBIDDEN");
    const pending = (await f.services.installationStore.pending(100))[0]!;
    expect(pending.state).toBe("removing");
    f.allow();
    await new WorkflowInstallations(f.services).finishRemoval(pending);
    expect((await f.installations.get("orders")).state).toBe("removed");
    expect(await f.store.plan(publication.workflowId, 1)).toBeNull();
    expect(await f.store.plan(publication.workflowId, 1, true)).not.toBeNull();
    for (let index = 0; index < 6; index++) {
        await f.runner().runOne();
    }
    expect((await f.runs.get("accepted")).status).toBe("succeeded");
});

test("failed publication confirmation cannot start runs; committed interruptions resume without recompiling", async () => {
    const f = setup();
    const api = f.installations;
    const reference = f.reference;
    const installed = await api.install("orders", reference, "{}", "admin");
    const mark = f.services.installationStore.markPublished.bind(f.services.installationStore);
    f.services.installationStore.markPublished = async () => false;
    await expect(api.publish("orders", 1)).rejects.toHaveProperty("code", "REVISION_CONFLICT");
    expect(await f.store.plan(installed.workflowId, 1)).toBeNull();
    expect(await f.store.plan(installed.workflowId, 1, true)).toBeNull();
    await expect(f.runs.start("forbidden", installed.workflowId, 1, "admin", { id: "order" })).rejects.toThrow();
    expect(f.store.runRecords.size).toBe(0);
    f.services.installationStore.markPublished = mark;
    const confirm = f.store.confirmInstalledPlan.bind(f.store);
    f.store.confirmInstalledPlan = async () => {
        throw new Error("Crash after commit");
    };
    await expect(api.publish("orders", 1)).rejects.toThrow("Crash after commit");
    expect(await f.store.plan(installed.workflowId, 1)).toBeNull();
    expect((await f.services.installationStore.get("orders"))!.pendingPublication).toBe(1);
    f.store.confirmInstalledPlan = confirm;
    f.services.contracts.resolve = async () => {
        throw new Error("Dependency is offline");
    };
    await new WorkflowInstallations(f.services).get("orders");
    expect(await f.store.plan(installed.workflowId, 1)).not.toBeNull();
    expect((await f.services.installationStore.get("orders"))!.pendingPublication).toBeNull();
});
