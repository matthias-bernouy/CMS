import { expect, spyOn, test } from "bun:test";
import { LocalContractReleases } from "@bernouy/repository/repository/filesystem";
import { cp } from "node:fs/promises";
import { join } from "node:path";
import { prepareReleasePublication } from "../../../src/exports/publication";
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

test("distribution publication uses only its snapshot and rechecks a revoked saved connection", async () => {
    const f = await pushFixture();
    try {
        await f.contract("built.example");
        await f.run(["release", f.source, "--recursive"]);
        const snapshot = join(f.root, "build-repository");
        await cp(join(f.data, "repository"), snapshot, { recursive: true });
        await f.contract("unrelated.example");
        await f.run(["release", f.source, "--recursive"]);
        const publication = await prepareReleasePublication(snapshot, f.options.environment);
        expect(publication.coordinates.map(({ id }) => id)).toEqual(["ulvia/built.example"]);
        await publication.publish(() => undefined);
        expect(await f.remoteFiles.list("contracts")).toHaveLength(1);
        const revoked = await prepareReleasePublication(snapshot, f.options.environment);
        await f.run(["repository", "logout"]);
        await expect(revoked.publish(() => undefined)).rejects.toThrow("Repository connection changed");
        expect(await f.remoteFiles.list("contracts")).toHaveLength(1);
    } finally {
        await f.close();
    }
});
