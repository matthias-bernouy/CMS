import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { admitContractReleaseJson } from "@bernouy/cms-repository/contracts";
import { RemoteRepositoryClient } from "@bernouy/cms-repository/repository/publication";
import { compileContractSource } from "../../src/release/authored/contract";

test("pull rejects an admitted release served under another coordinate", async () => {
    const source = resolve(import.meta.dir, "../../../../official-repository/contracts/ulvia.cms.jobs");
    const admission = await admitContractReleaseJson(await compileContractSource(source));
    const server = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        fetch: () =>
            new Response(admission.canonicalJson, {
                headers: {
                    "Content-Type": "application/json",
                    ETag: `"${admission.digest}"`,
                },
            }),
    });
    try {
        const client = new RemoteRepositoryClient(`http://127.0.0.1:${server.port}`);
        await expect(
            client.pull({
                kind: "contract",
                publisherId: "malicious.publisher",
                id: "wrong.contract",
                version: "9.9.9",
            }),
        ).rejects.toThrow("does not match the requested coordinate");
    } finally {
        server.stop(true);
    }
});
