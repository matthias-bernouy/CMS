import { afterEach, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { seedOfficialRepository } from "../src/seed";

const roots: string[] = [];

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("installs a bundled repository snapshot once without replacing existing storage", async () => {
    const parent = await temporaryRoot();
    const seed = await temporaryRoot();
    const root = join(parent, "current");
    await writeFile(join(seed, "seed-marker"), "v1");

    await seedOfficialRepository(root, seed);
    expect(await readFile(join(root, "seed-marker"), "utf8")).toBe("v1");

    await writeFile(join(seed, "seed-marker"), "v2");
    await seedOfficialRepository(root, seed);
    expect(await readFile(join(root, "seed-marker"), "utf8")).toBe("v1");
});

async function temporaryRoot(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "official-repository-seed-"));
    roots.push(root);
    return root;
}
