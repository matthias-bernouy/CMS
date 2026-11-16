import { expect, test } from "bun:test";
import { symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readManifest } from "../../../infra/distribution/manifest";
import { inspectImages } from "../../../infra/distribution/images";
import { distributionVersion } from "../../../infra/distribution/options";
import { distributionFixture } from "./fixture";

test("manifest preserves independent contract versions and exact build inputs", async () => {
    const f = await distributionFixture();
    try {
        expect(await readManifest(f.destination, f.version)).toEqual(f.manifest);
        expect(f.manifest.resources[0]?.version).toBe("1.0.0");
        await writeFile(join(f.destination, "manifest.json"), JSON.stringify({ ...f.manifest, version: "2.0.0" }));
        await expect(readManifest(f.destination, f.version)).rejects.toThrow("Invalid or modified");
    } finally {
        await f.close();
    }
});

test("symlinked artifacts cannot substitute external bytes", async () => {
    const f = await distributionFixture();
    try {
        await symlink(f.archive, join(f.destination, "repository/foreign"));
        await expect(readManifest(f.destination, f.version)).rejects.toThrow("Symbolic");
    } finally {
        await f.close();
    }
});

test("image version, component, revision and content identity must match", async () => {
    const f = await distributionFixture();
    try {
        const inspect = (revision: string) => async (args: readonly string[]) => {
            const component = args.at(-1)!.includes("ulvia-edge") ? "edge" : "provider";
            return JSON.stringify([
                {
                    Id: f.images.find((image) => image.component === component)!.id,
                    Config: {
                        Labels: {
                            "io.ulvia.component": component,
                            "io.ulvia.stack-api": "1",
                            "io.ulvia.hosting-api": "1",
                            "org.opencontainers.image.version": f.version,
                            "org.opencontainers.image.revision": revision,
                        },
                    },
                },
            ]);
        };
        expect(await inspectImages(f.version, f.revision, inspect(f.revision))).toEqual(f.images);
        await expect(inspectImages(f.version, f.revision, inspect("other"))).rejects.toThrow("mismatched");
    } finally {
        await f.close();
    }
});

test("invalid distribution arguments fail before any work", () => {
    expect(distributionVersion([], false)).toBeUndefined();
    for (const args of [
        [],
        ["--version"],
        ["--version", "../other"],
        ["--version", "01.2.3"],
        ["--version", "1.2.3-01"],
        ["--version", "1.2.3", "extra"],
    ]) {
        expect(() => distributionVersion(args, true)).toThrow("Usage:");
    }
});
