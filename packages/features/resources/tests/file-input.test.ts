import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readResourceArchive, writeResourceArchive } from "../src/exports";
import { documentFixture } from "./fixtures";

test("materializes a filesystem-backed archive before returning verified bytes for durable retention", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ulvia-resource-input-"));
    try {
        const built = await writeResourceArchive({ document: documentFixture(), assets: [] });
        const original = new Uint8Array(await built.bytes.arrayBuffer());
        const path = join(directory, "base.zip");
        await writeFile(path, original);
        const verified = await readResourceArchive(Bun.file(path), { expectedDigest: built.digest });
        await writeFile(path, new Uint8Array(original.byteLength));
        expect(new Uint8Array(await verified.bytes.arrayBuffer())).toEqual(original);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
