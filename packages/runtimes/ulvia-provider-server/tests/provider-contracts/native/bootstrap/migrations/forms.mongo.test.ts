import { selectForeignEmailer } from "./foreign";
import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { contentMongo } from "../../../../../../../../tests/integration/content/mongo";
import { formsMigrationPlan } from "../../../../../src/maintenance/forms/plan";
import { applyFormsMigration } from "../../../../../src/maintenance/forms/apply";
import { readInstalledExecution } from "../../../../../src/runtime/instances/system/execution/installed";
import { ProviderExecutionSupport } from "../../../../../src/runtime/instances/system/execution/support";
import {
    assertHostedReleaseRetention,
    managedReleaseReader,
} from "../../../../../src/runtime/instances/system/retention";
import { SystemBootstrap } from "../../../../../src/runtime/instances/system/execution/SystemBootstrap";
import { migrationFixture } from "./fixture";
const enabled = process.env.ULVIA_RUN_FORMS_MIGRATION_MONGO === "1";
describe.skipIf(!enabled)("offline native Forms metadata migration", () => {
    let mongo: Awaited<ReturnType<typeof contentMongo>>;
    beforeAll(async () => {
        mongo = await contentMongo();
    }, 30000);
    afterAll(async () => {
        await mongo?.close();
    }, 30000);
    test("both exact legacy versions are upgraded into ordinary executable Forms 2 metadata", async () => {
        for (const version of ["1.0.0", "1.1.0"] as const) {
            const f = await migrationFixture(mongo.client, version);
            const foreign = await selectForeignEmailer(f, true);
            await f.db.collection<{ _id: string; [key: string]: unknown }>("workflow_plans").insertOne({
                _id: "workflow:1",
                retired: false,
                targets: [
                    {
                        contractId: "ulvia/cms.forms",
                        version,
                        capabilityId: "forms.get",
                        installationId: "installation:native",
                    },
                ],
            });
            await expect(formsMigrationPlan(mongo.client, f.artifacts, f.endpoint)).rejects.toThrow("WORKFLOW_IN_USE");
            await f.db
                .collection("workflow_plans")
                .updateOne({}, { $set: { "targets.0.installationId": foreign.installed.installation.id } });
            const before = await f.stores.selections.get("default");
            const plan = await formsMigrationPlan(mongo.client, f.artifacts, f.endpoint);
            expect(plan.instances).toBe(1);
            expect(await f.stores.selections.get("default")).toEqual(before);
            const exports: unknown[] = [];
            await expect(
                applyFormsMigration(mongo.client, f.artifacts, f.bootstrap, f.endpoint, "0".repeat(64), async () => {}),
            ).rejects.toThrow("PLAN_CHANGED");
            await applyFormsMigration(mongo.client, f.artifacts, f.bootstrap, f.endpoint, plan.digest, async (row) => {
                exports.push(row);
            });
            const instance = (await f.registry.get(f.instance.id))!;
            const support = new ProviderExecutionSupport();
            const execution = await readInstalledExecution(instance, f.stores, support, f.endpoint);
            expect(execution.plan.contracts.find((pin) => pin.contractId === "ulvia/cms.forms")?.version).toBe("2.0.0");
            expect(execution.plan.manifest).toEqual(f.artifacts.plan.manifest);
            const installed = (await f.stores.installations.list("default")).find(
                (row) => row.installation.id === "installation:native",
            )!;
            expect(
                await f.stores.installations.get({
                    siteId: "default",
                    installationId: foreign.installed.installation.id,
                }),
            ).toEqual(foreign.installed);
            expect(
                (await f.stores.selections.get("default"))?.plan.selections.find(
                    (pin) => pin.contractId === foreign.pin.contractId,
                ),
            ).toEqual(foreign.pin);
            expect(installed.installation.providerTokenRef).toBe("${PROVIDER_TOKEN}");
            expect(installed.installation.gatewayTokenRef).toBe("${GATEWAY_TOKEN}");
            expect(installed.installation.accountId).toBe(f.instance.id);
            expect((await f.stores.selections.get("default"))?.grants).toEqual(before?.grants);
            await assertHostedReleaseRetention(
                support,
                {
                    instances: f.registry.scan(),
                    transitions: async function* () {},
                    hasUnstagedUpgrade: async () => false,
                },
                managedReleaseReader(mongo.client, support, f.endpoint),
                new SystemBootstrap(f.bootstrap),
            );
            expect((await formsMigrationPlan(mongo.client, f.artifacts, f.endpoint)).instances).toBe(0);
            await mongo.client.db().collection("ulvia_provider_instances").deleteOne({ id: instance.id });
            await f.db.dropDatabase();
        }
    }, 60000);
    test("denied native Forms actions also deny their replacement identifiers", async () => {
        const f = await migrationFixture(mongo.client, "1.1.0");
        const selected = (await f.stores.selections.get("default"))!;
        await f.stores.selections.replace("default", selected.plan.selections, selected.revision, {
            default: "allow-selected",
            denied: [{ contractId: "ulvia/cms.forms", capabilityId: "forms.submit" }],
        });
        const plan = await formsMigrationPlan(mongo.client, f.artifacts, f.endpoint);
        await applyFormsMigration(mongo.client, f.artifacts, f.bootstrap, f.endpoint, plan.digest, async () => {});
        expect((await f.stores.selections.get("default"))?.grants.denied).toEqual([
            { contractId: "ulvia/cms.forms", capabilityId: "forms.submit-v2" },
        ]);
        await mongo.client.db().collection("ulvia_provider_instances").deleteOne({ id: f.instance.id });
        await f.db.dropDatabase();
    }, 60000);
    test("unfinished transitions refuse without modifying approval or selections", async () => {
        const f = await migrationFixture(mongo.client, "1.1.0");
        const before = await f.stores.installations.list("default");
        await mongo.client.db().collection("ulvia_provider_instance_transitions").insertOne({ status: "failed" });
        await expect(formsMigrationPlan(mongo.client, f.artifacts, f.endpoint)).rejects.toThrow(
            "Finish instance transitions",
        );
        expect(await f.stores.installations.list("default")).toEqual(before);
        expect(await f.stores.selections.get("default")).toEqual(f.selected);
    }, 30000);
});
