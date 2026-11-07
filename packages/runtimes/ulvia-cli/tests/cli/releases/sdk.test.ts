import { expect, test } from "bun:test";
import { readFile, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { batchFixture } from "./fixtures";
import { writeSdkModule } from "./sdk.fixture";

test("SDK source discovery emits verified documentation and exact retries are immutable", async () => {
    const f = await batchFixture();
    try {
        const configure = await writeSdkModule(f.source);
        await configure();
        await f.run(["release", f.source]);
        const first = await f.files.get("contracts", "batch", "batch/sdk.example", "1.0.0");
        expect(first).not.toBeNull();
        await f.run(["release", f.source, "--recursive"]);
        expect(f.output.at(-1)).toBe("Prepared 1 local releases.");
        expect(f.output.at(-2)).toStartWith("= contract batch/sdk.example@1.0.0");
        expect(await f.files.get("contracts", "batch", "batch/sdk.example", "1.0.0")).toEqual(first);
        expect(await f.files.list("contracts")).toHaveLength(1);
        const release = JSON.parse(first!.toString());
        expect(release.documentation[0].path).toBe("overview.md");
    } finally {
        await f.close();
    }
});

test("SDK releases enforce declared version evolution before any cache mutation", async () => {
    const f = await batchFixture();
    try {
        const configure = await writeSdkModule(f.source);
        await configure();
        await f.run(["release", f.source]);
        const before = await f.files.get("contracts", "batch", "batch/sdk.example", "1.0.0");
        await configure({ documentation: "Changed documentation." });
        await expect(f.run(["release", f.source])).rejects.toThrow();
        expect(await f.files.get("contracts", "batch", "batch/sdk.example", "1.0.0")).toEqual(before);
        await configure({ version: "1.0.1", documentation: "Changed documentation." });
        await f.run(["release", f.source]);
        expect(await f.files.list("contracts")).toHaveLength(2);
        await configure({ version: "1.1.0", maxLength: 16 });
        await expect(f.run(["release", f.source])).rejects.toThrow();
        expect(await f.files.list("contracts")).toHaveLength(2);
    } finally {
        await f.close();
    }
});

test("SDK roots reject ambiguous definitions, symbolic entry files and invalid artifacts before writes", async () => {
    const f = await batchFixture();
    try {
        const configure = await writeSdkModule(f.source);
        await configure();
        await writeFile(join(f.source, "definition.json"), JSON.stringify({ kind: "contract" }));
        await expect(f.run(["release", f.source])).rejects.toThrow("both");
        const other = join(f.root, "linked");
        const { mkdir } = await import("node:fs/promises");
        await mkdir(other);
        await symlink(join(f.source, "ulvia.release.ts"), join(other, "ulvia.release.ts"));
        await expect(f.run(["release", other])).rejects.toThrow("regular file");
        const invalid = join(f.root, "invalid");
        await mkdir(invalid);
        await writeFile(
            join(invalid, "ulvia.release.ts"),
            'export default async () => [{ kind: "contract", admission: { release: { contractId: "batch/forged", version: "1.0.0" }, canonicalJson: "{}", digest: "forged" } }];',
        );
        await expect(f.run(["release", invalid])).rejects.toThrow();
        expect(await f.files.list("contracts")).toEqual([]);
        expect(await readFile(join(f.source, "release.json"), "utf8")).toContain("1.0.0");
    } finally {
        await f.close();
    }
});
