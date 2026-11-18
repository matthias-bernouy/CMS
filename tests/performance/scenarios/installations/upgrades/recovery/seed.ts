import { docker } from "../../../../../integration/instance/docker";
import { assertCondition } from "../../../queries/types";
import type { UpgradeContext } from "../context";
import type { SiteUpgradeIntent } from "@bernouy/repository/upgrades";
import { assertUpgradeSeedScope } from "../../recovery/scope";

export async function seedContractRecovery(context: UpgradeContext, intent: SiteUpgradeIntent<unknown>) {
    const stack = context.environment.stack;
    const site = context.state.site;
    assertUpgradeSeedScope(stack.id, stack.providerName, site.instanceId, site.url);
    assertCondition(intent.siteId === "default" && intent.kind === "contracts" && intent.status === "prepared");
    const encoded = JSON.stringify(intent);
    assertCondition(Buffer.byteLength(encoded) <= 64 * 1024);
    const script = `
        import { MongoClient } from "mongodb";
        import { MongoSiteUpgradeStorage } from "@bernouy/repository/upgrades/mongo";
        import { MongoProviderInstanceRegistry } from "/app/packages/runtimes/ulvia-provider-server/src/runtime/instances/MongoProviderInstanceRegistry";
        import { instanceDatabaseName } from "/app/packages/runtimes/ulvia-provider-server/src/runtime/stores/storageRoots";
        const client=new MongoClient(process.env.MONGO_URL);
        try {
            await client.connect();
            const record=await new MongoProviderInstanceRegistry(client.db()).get(${JSON.stringify(site.instanceId)});
            if(!record||record.status!=="ready"||record.cmsUrl!==${JSON.stringify(site.url)})throw Error("Upgrade fixture ownership refused");
            const storage=new MongoSiteUpgradeStorage(client.db(instanceDatabaseName(record.storageKey)));
            await storage.init();
            if(await storage.getActive("default"))throw Error("Upgrade fixture already active");
            const result=await storage.begin(${encoded});
            if(result.status!=="prepared")throw Error("Upgrade fixture was not prepared");
            console.log(JSON.stringify({id:result.id,status:result.status}));
        }finally{await client.close();}
    `;
    const result = await docker([
        "exec",
        "--workdir",
        "/app/packages/runtimes/ulvia-provider-server",
        stack.providerName,
        "bun",
        "--no-macros",
        "-e",
        script,
    ]);
    const created = JSON.parse(result.stdout.trim());
    assertCondition(created.id === intent.id && created.status === "prepared");
    return intent;
}
