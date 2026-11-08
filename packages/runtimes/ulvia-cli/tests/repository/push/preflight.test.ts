import { expect, spyOn, test } from "bun:test";
import { LocalContractReleases } from "@bernouy/repository/repository/filesystem";
import { pushFixture } from "./fixtures";

test("batch preflight restores a bounded number of catalogues instead of one per contract", async () => {
    const f = await pushFixture();
    let reads: ReturnType<typeof spyOn> | undefined;
    try {
        for (const id of ["first.example", "second.example", "third.example", "fourth.example"]) {
            await f.contract(id);
        }
        await f.run(["release", f.source, "--recursive"]);
        const catalogue = spyOn(LocalContractReleases.prototype, "catalogue");
        reads = catalogue;
        let preflightReads = 0;
        const log = f.options.log;
        f.options.log = (message) => {
            if (message.startsWith("Publishing ")) {
                preflightReads = catalogue.mock.calls.length;
            }
            log(message);
        };
        await f.run(["push", "all"]);
        expect(preflightReads).toBe(3);
        expect(await f.remoteFiles.list("contracts")).toHaveLength(4);
        expect(f.output.at(-1)).toBe("Published 4 local releases.");
    } finally {
        reads?.mockRestore();
        await f.close();
    }
});
