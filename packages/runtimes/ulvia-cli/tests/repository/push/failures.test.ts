import { join, resolve } from "node:path";
import { LocalArtifactFiles } from "@bernouy/cms-repository/repository/filesystem";
import { writeAuthoredContractFixture } from "../../authoredContractFixture";
import { expect, test } from "bun:test";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { readClientConfig } from "../../../src/runtime/repository/config";
import { pushFixture } from "./fixtures";

test("push all validates every namespace credential before the first upload", async () => {
    const f = await pushFixture();
    try {
        await f.contract("a.owned");
        await f.contract("z.foreign", { publisher: "foreign" });
        await f.run(["release", f.source, "--recursive"]);
        await f.run(["identity", "create", "foreign"]);
        await f.run(["namespace", "claim", "foreign", "--identity", "foreign"]);
        const config = await readClientConfig(f.config);
        await rm(config.identities.foreign!.keyFile);
        await expect(f.run(["push", "all"])).rejects.toThrow();
        expect(await f.remoteFiles.list("contracts")).toEqual([]);
    } finally {
        await f.close();
    }
});

test("push all rejects an empty local cache", async () => {
    const f = await pushFixture();
    try {
        await expect(f.run(["push", "all"])).rejects.toThrow("No non-yanked local releases");
    } finally {
        await f.close();
    }
});

test("a partially failed push all can be resumed by repeating the same command", async () => {
    const f = await pushFixture();
    let creates = 0;
    let reject = true;
    const proxy = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        async fetch(request) {
            const url = new URL(request.url);
            if (request.method === "POST" && url.pathname === "/v1/publication-uploads" && ++creates === 2 && reject) {
                return Response.json({ error: { message: "Simulated upload refusal" } }, { status: 503 });
            }
            return fetch(new Request(new URL(url.pathname + url.search, f.server.url), request));
        },
    });
    try {
        await f.contract("first.example");
        await f.contract("second.example");
        await f.run(["release", f.source, "--recursive"]);
        await expect(f.run(["push", "all", "--repository", proxy.url.origin])).rejects.toThrow("1/2 completed");
        expect(await f.remoteFiles.list("contracts")).toHaveLength(1);
        reject = false;
        f.output.length = 0;
        await f.run(["push", "all", "--repository", proxy.url.origin]);
        expect(await f.remoteFiles.list("contracts")).toHaveLength(2);
        expect(f.output[1]).toStartWith("= contract");
        expect(f.output[2]).toStartWith("+ contract");
    } finally {
        proxy.stop(true);
        await f.close();
    }
});

test("corrupt fixture assets stop push all before any earlier valid release is uploaded", async () => {
    const f = await pushFixture();
    try {
        await f.contract("first.example", { version: "0.0.1" });
        const fixtures = resolve(
            import.meta.dir,
            "../../../../../features/cms-repository/fixtures/contracts/protocol-v1",
        );
        const directory = join(f.source, "communication.receipt");
        await writeAuthoredContractFixture(directory, await readFile(join(fixtures, "mock.contract.json")));
        await mkdir(join(directory, "fixtures"));
        await writeFile(
            join(directory, "fixtures/receipt.svg"),
            await readFile(join(fixtures, "mock-assets/receipt.svg")),
        );
        await f.run(["release", f.source, "--recursive"]);
        const files = new LocalArtifactFiles(join(f.data, "repository"));
        const bytes = await files.get("contracts", "ulvia.official", "communication.receipt", "0.1.0");
        await Bun.write(files.fixtureBlob(bytes!.toString("utf8"), "receipt.svg"), "tampered");
        await expect(f.run(["push", "all"])).rejects.toThrow("fixture asset");
        expect(await f.remoteFiles.list("contracts")).toEqual([]);
    } finally {
        await f.close();
    }
});
