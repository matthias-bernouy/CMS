import { expect, test } from "bun:test";
import { compileOfficialFeatures } from "@bernouy/ulvia-provider/build";
import { RemoteRepositoryClient } from "@bernouy/repository/repository/publication";

test("pull rejects an admitted release served under another coordinate", async () => {
    const admission = (await compileOfficialFeatures()).contracts.find(
        ({ release }) => release.contractId === "ulvia/cms.installations",
    )!;
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
