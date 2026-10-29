import { expect } from "bun:test";
import { docker } from "../containers";

/** Real Mongo joins must retain site filters and use one command for a warm authorization phase. */
export async function exerciseExecutionState(providerName: string, stackId: string) {
    const database = `ulvia_execution_${stackId.replaceAll("-", "_")}`;
    const script = `
        import { strict as assert } from "node:assert";
        import { MongoClient } from "mongodb";
        import { MongoProviderExecutionStateReader } from "@bernouy/cms-repository/providers/mongo";
        import { planContractSelections } from "@bernouy/cms-repository/providers/selections";
        import { deepFreeze } from "@bernouy/cms-repository/contracts/protocol";
        import { graphFixture, siteId } from "/app/packages/features/cms-repository/tests/providers/selections/fixtures";
        import { readProviderRuntimeEnv } from "/app/packages/runtimes/ulvia-provider-server/src/runtimeEnv";
        const name = ${JSON.stringify(database)};
        assert.match(name, /^ulvia_execution_[a-z0-9_]+$/);
        const client = new MongoClient(readProviderRuntimeEnv(process.env).MONGO_URL, { monitorCommands: true });
        let commands = 0;
        let aggregate;
        client.on("commandStarted", event => {
            commands++;
            if (event.commandName === "aggregate") { aggregate = event.command; }
        });
        await client.connect();
        const db = client.db(name);
        try {
            const graph = await graphFixture();
            const plan = await planContractSelections(siteId, [await graph.select("payment")], graph.context);
            let selected = deepFreeze({ siteId, revision: 1, dependencyRevision: "initial", grants: { default: "allow-selected", denied: [] }, plan });
            let installed = deepFreeze({ revision: 1, installation: graph.installation });
            let payloadReads = 0;
            const selections = db.collection("cms_contract_selections");
            const installations = db.collection("cms_provider_installations");
            await selections.insertOne({ _id: siteId, siteId, revision: 1 });
            await installations.insertMany([
                { _id: graph.installation.id, siteId, revision: 1 },
                { _id: "unrelated", siteId, revision: 1 },
            ]);
            await installations.createIndex({ siteId: 1, _id: 1 });
            const reader = new MongoProviderExecutionStateReader(db,
                { get: async () => { payloadReads++; return selected; } },
                { get: async () => { payloadReads++; return installed; } });
            await reader.init();
            await reader.init();
            const first = await reader.read(siteId, [graph.installation.id]);
            const before = commands;
            assert.deepEqual(await reader.read(siteId, [graph.installation.id]), first);
            assert.equal(commands - before, 1);
            assert.equal(payloadReads, 2);
            const executionPlan = await db.collection(aggregate.aggregate).aggregate(aggregate.pipeline).explain("executionStats");
            const docsExamined = executionPlan.stages.reduce((total, stage) => total + (stage.$cursor?.executionStats?.totalDocsExamined ?? stage.totalDocsExamined ?? 0), 0);
            assert.equal(docsExamined, 0);
            installed = deepFreeze({ revision: 2, installation: { ...graph.installation, status: "disabled" } });
            await installations.updateOne({ _id: graph.installation.id }, { $set: { revision: 2 } });
            assert.equal((await reader.read(siteId, [graph.installation.id])).installations[0].installation.status, "disabled");
            let revokeDuringLoad = true;
            const guarded = new MongoProviderExecutionStateReader(db,
                { get: async () => selected },
                { get: async () => {
                    const record = installed;
                    if (revokeDuringLoad) {
                        revokeDuringLoad = false;
                        selected = deepFreeze({ ...selected, revision: 2, grants: { default: "allow-selected", denied: [{ contractId: "payment", capabilityId: "pay" }] } });
                        await selections.updateOne({ _id: siteId }, { $set: { revision: 2 } });
                    }
                    return record;
                } });
            assert.equal((await guarded.read(siteId, [graph.installation.id])).selections.grants.denied.length, 1);
            assert.equal((await reader.read(siteId, [graph.installation.id])).selections.grants.denied.length, 1);
            await installations.updateOne({ _id: graph.installation.id }, { $set: { siteId: "another-site" } });
            const missing = await reader.read(siteId, [graph.installation.id]);
            assert.deepEqual(missing.installations, []);
            assert.equal(missing.selections.revision, 2);
            assert.equal((await reader.read(siteId, [])).selections.grants.denied.length, 1);
            assert.deepEqual(await reader.read("another-site", [graph.installation.id]), { selections: null, installations: [] });
            await selections.updateOne({ _id: siteId }, { $set: { siteId: "another-site" } });
            assert.deepEqual(await reader.read(siteId, [graph.installation.id]), { selections: null, installations: [] });
            await selections.deleteOne({ _id: siteId });
            assert.deepEqual(await reader.read(siteId, [graph.installation.id]), { selections: null, installations: [] });
            console.log(JSON.stringify({ warmCommands: 1, examinedDocuments: 0, isolated: true, revocationsFresh: true }));
        } finally { await db.dropDatabase(); await client.close(); }
    `;
    const result = await docker([
        "exec",
        "--workdir",
        "/app/packages/runtimes/ulvia-provider-server",
        providerName,
        "bun",
        "--no-macros",
        "-e",
        script,
    ]);
    expect(JSON.parse(result.stdout.trim())).toEqual({
        warmCommands: 1,
        examinedDocuments: 0,
        isolated: true,
        revocationsFresh: true,
    });
}
