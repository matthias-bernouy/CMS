import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("instrumentation preserves fetch metadata, Node transport, full bytes and cancellation without recording credentials", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ulvia-capability-network-"));
    try {
        const script = join(directory, "network.ts");
        await writeFile(
            script,
            `
            import { randomUUID } from "node:crypto";
            import { get } from "node:http";
            import { instrumentNetwork } from ${JSON.stringify(resolve(import.meta.dir, "network.ts"))};
            import { traceFile } from ${JSON.stringify(resolve(import.meta.dir, "records.ts"))};
            const traceId=randomUUID();const path=traceFile(traceId);
            const server=Bun.serve({hostname:"127.0.0.1",port:0,fetch(request){
                if(new URL(request.url).pathname==="/stream")return new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(4096))}}));
                return new Response("payload",{status:201,headers:{"x-probe":"preserved","set-cookie":"session=private-cookie"}});
            }});
            instrumentNetwork(()=>traceId);
            try{
                const url=server.url+"read?private-query=secret";
                const response=await fetch(url,{headers:{authorization:"Bearer private-token"}});
                if(response.status!==201||response.url!==url||response.headers.get("x-probe")!=="preserved"||await response.text()!=="payload")throw Error("Fetch semantics changed");
                await new Promise((resolve,reject)=>{get(url,r=>{let text="";r.on("data",chunk=>text+=chunk);r.on("end",()=>text==="payload"?resolve():reject(Error("Node bytes changed")));r.on("error",reject)}).on("error",reject)});
                const stream=await fetch(server.url+"stream");await stream.body.cancel();
                const text=await Bun.file(path).text();const rows=text.trim().split("\\n").map(JSON.parse);
                if(rows.filter(r=>r.kind==="http").length!==3||rows.filter(r=>r.kind==="http-body"&&r.complete===true&&r.bytes===7).length!==2||!rows.some(r=>r.kind==="http-body"&&r.complete===false))throw Error("Incomplete network accounting");
                if(["private-token","private-query","private-cookie","secret"].some(value=>text.includes(value)))throw Error("Probe retained a secret");
            }finally{server.stop(true);await Bun.file(path).delete().catch(()=>{})}
        `,
        );
        const child = Bun.spawn([process.execPath, script], { stdout: "pipe", stderr: "pipe" });
        const error = await new Response(child.stderr).text();
        expect(await child.exited, error).toBe(0);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
