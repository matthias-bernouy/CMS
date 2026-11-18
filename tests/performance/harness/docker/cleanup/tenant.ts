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

/** Called only after sample collection and admitted disable; keep the disabled catalogue record for history. */
export async function discardDisabledTenantDatabase(stack: Stack, tenant: Tenant) {
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
            await client.db(database).dropDatabase();
            console.log(JSON.stringify({removed:true}));
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
    if (JSON.parse(result.stdout.trim()).removed !== true) {
        throw new Error("Disabled performance tenant database was not removed");
    }
}
