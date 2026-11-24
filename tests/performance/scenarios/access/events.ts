import { docker } from "../../../integration/instance/docker";
import { assertCondition, requireRecord } from "../queries/types";
import { accessReadContext } from "./advanced/context";
import type { CapabilityInventory, Variant } from "../../capabilities/types";
import type { QueryEnvironment } from "../queries/execute";
import type { PreparedSample } from "../../harness/execution/samples";

/** Test-only lookup of the generated reference; no raw subject is accepted by the measured API. */
async function eventReference(provider: string, sub: string) {
    assertCondition(/^ulvia-mcp-[a-f0-9]{8}-provider$/u.test(provider) && /^local:[a-f0-9-]{36}$/u.test(sub));
    const result = await docker([
        "exec",
        provider,
        "bun",
        "-e",
        `
        const {createRequire}=require("node:module");
        const scope=createRequire("/app/packages/runtimes/ulvia-provider-server/package.json");
        const {MongoClient}=scope("mongodb");
        const client=await MongoClient.connect("mongodb://mongo:27017");
        try{
            const refs=[];
            for(const info of (await client.db("admin").admin().listDatabases()).databases){
                if(["admin","config","local"].includes(info.name))continue;
                const row=await client.db(info.name).collection("users").findOne({_id:${JSON.stringify(sub)}},{projection:{accessAccountReference:1}});
                if(row)refs.push(row.accessAccountReference);
            }
            if(refs.length!==1)throw Error("Event profile fixture ownership was not exact");
            console.log(JSON.stringify({reference:refs[0]}));
        }finally{await client.close();}
    `,
    ]);
    const value = requireRecord(JSON.parse(result.stdout.trim()));
    assertCondition(typeof value.reference === "string" && /^[a-f0-9-]{36}$/u.test(value.reference));
    return value.reference;
}
export async function prepareEventProfile(
    inventory: CapabilityInventory,
    environment: QueryEnvironment,
    variant: Variant,
): Promise<PreparedSample> {
    const context = accessReadContext(inventory, environment);
    try {
        let retiredRef: string | undefined;
        if (variant === "invalidation") {
            const old = accessReadContext(inventory, environment);
            try {
                const prior = await old.create();
                retiredRef = await eventReference(environment.stack.providerName, prior.sub);
                const profile = await old.fixture("get-event-account", { accountRef: retiredRef });
                assertCondition(profile.email === prior.email);
            } finally {
                await old.close();
            }
        }
        const user = await context.create();
        const accountRef = await eventReference(environment.stack.providerName, user.sub);
        let createdAt: string | undefined;
        return {
            async send() {
                return (
                    await context.call("get-event-account", { accountRef }, (output) => {
                        const profile = requireRecord(output);
                        assertCondition(profile.email === user.email && typeof profile.createdAt === "string");
                        assertCondition(Object.keys(profile).sort().join(",") === "createdAt,email");
                        createdAt = profile.createdAt;
                    })
                ).observation;
            },
            async verify() {
                const member = await context.call("get-event-account", { accountRef }, undefined, {
                    httpCredentials: { cookie: user.cookie },
                });
                assertCondition(member.observation.status === 403 && !member.observation.validated);
                const foreign = await context.call("get-event-account", { accountRef }, undefined, {
                    httpCredentials: { cookie: environment.registry.cookie },
                });
                assertCondition([401, 403].includes(foreign.observation.status));
                if (retiredRef) {
                    const missing = await context.call("get-event-account", { accountRef: retiredRef });
                    assertCondition(!missing.observation.validated && missing.observation.status === 404);
                    assertCondition(retiredRef !== accountRef);
                }
                const original = await context.fixture("get-user", { sub: user.sub });
                assertCondition(original.email === user.email && original.createdAt === createdAt);
            },
            close: context.close,
        };
    } catch (error) {
        await context.close();
        throw error;
    }
}
