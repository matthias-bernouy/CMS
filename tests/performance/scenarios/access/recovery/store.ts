import { createHash } from "node:crypto";
import { docker } from "../../../../integration/instance/docker";
import { assertCondition } from "../../queries/types";

/** Seed a valid unverified/no-active-challenge state through the public test-composed token adapter. */
export async function removeSignupChallenge(provider: string, token: string) {
    assertCondition(/^ulvia-mcp-[a-f0-9]{8}-provider$/u.test(provider) && /^auth_[a-zA-Z0-9_-]{43}$/u.test(token));
    const hash = createHash("sha256").update(token).digest("hex");
    // Only the one-way digest crosses the Docker command boundary; the plaintext challenge stays in memory.
    const script = `
        const {createRequire}=require("node:module");
        const scope=createRequire("/app/packages/runtimes/ulvia-provider-server/package.json");
        const {MongoClient}=scope("mongodb");const {MongoAuthTokenStore}=scope("@bernouy/auth/mongo");
        const client=await MongoClient.connect("mongodb://mongo:27017");
        try{
            const matches=[];
            for(const info of (await client.db("admin").admin().listDatabases()).databases){
                if(["admin","config","local"].includes(info.name))continue;
                const database=client.db(info.name);
                const row=await database.collection("auth_tokens").findOne({hash:${JSON.stringify(hash)},purpose:"email_verification",consumedAt:null},{projection:{sub:1}});
                if(row)matches.push({database,sub:row.sub});
            }
            if(matches.length!==1)throw Error("Challenge fixture ownership was not exact");
            const owned=matches[0];
            if(await owned.database.collection("auth_tokens").countDocuments({sub:owned.sub,purpose:"email_verification"})!==1)throw Error("Challenge fixture was not exclusive");
            const removed=await new MongoAuthTokenStore(owned.database).deleteForSub(owned.sub,"email_verification");
            if(removed!==1)throw Error("Challenge fixture cleanup was incomplete");
            console.log(JSON.stringify({removed}));
        }finally{await client.close();}
    `;
    const result = await docker(["exec", provider, "bun", "-e", script]);
    assertCondition(JSON.parse(result.stdout.trim()).removed === 1);
}
