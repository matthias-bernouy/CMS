import { docker } from "../../../../integration/instance/docker";

type Stack = Readonly<{ id: string; providerName: string }>;
type Tenant = Readonly<{ instanceId: string; origin: string }>;

export function assertDisabledTenantRecord(
    tenant: Tenant,
    record: Readonly<{ id?: unknown; cmsUrl?: unknown; status?: unknown }> | null,
) {
    if (!record || record.id !== tenant.instanceId || record.cmsUrl !== tenant.origin || record.status !== "disabled") {
        throw new Error("Tenant cleanup ownership refused");
    }
}

export function assertOwnedTenantCleanup(stack: Stack, tenant: Tenant) {
    const url = new URL(tenant.origin);
    if (
        !/^ulvia-mcp-[a-f0-9]{8}$/u.test(stack.id) ||
        stack.providerName !== `${stack.id}-provider` ||
        !/^instance:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u.test(tenant.instanceId) ||
        url.protocol !== "http:" ||
        url.origin !== tenant.origin ||
        url.pathname !== "/" ||
        url.search ||
        url.hash ||
        url.username ||
        url.password ||
        !/^(?:performance-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}|perf-flow-[a-f0-9]{24})\.localhost$/u.test(
            url.hostname,
        )
    ) {
        throw new Error("Tenant cleanup requires a single-use performance tenant in its exact disposable stack");
    }
}

/** Disabled tenants remain restartable until the entire owned Docker stack is removed. */
export async function retainDisabledTenantDatabase(stack: Stack, tenant: Tenant) {
    assertOwnedTenantCleanup(stack, tenant);
    const script = `
        import { MongoClient } from "mongodb";
        import { MongoProviderInstanceRegistry } from "/app/packages/runtimes/ulvia-provider-server/src/runtime/instances/MongoProviderInstanceRegistry";
        import { instanceDatabaseName } from "/app/packages/runtimes/ulvia-provider-server/src/runtime/stores/storageRoots";
        const client=new MongoClient(process.env.MONGO_URL);
        try {
            await client.connect();
            const record=await new MongoProviderInstanceRegistry(client.db()).get(${JSON.stringify(tenant.instanceId)});
            const assertRecord=(${assertDisabledTenantRecord.toString()});
            assertRecord(${JSON.stringify(tenant)},record);
            const database=instanceDatabaseName(record.storageKey);
            if(database===client.db().databaseName)throw Error("Control database cleanup refused");
            const retained=await client.db(database).collection("cms_provider_installations").countDocuments({siteId:"default"},{limit:1});
            if(retained!==1)throw Error("Disabled performance tenant persistence is unavailable");
            console.log(JSON.stringify({retained:true}));
        } finally {await client.close();}
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
    if (JSON.parse(result.stdout.trim()).retained !== true) {
        throw new Error("Disabled performance tenant persistence was not retained");
    }
}
