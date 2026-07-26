import { afterEach, describe, expect, test } from "bun:test";
import {
    chmodSync,
    existsSync,
    lstatSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    readdirSync,
    rmSync,
    statSync,
    symlinkSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { removeImmutableTreeIfExists } from "../../src/default-implementation/fs/registry/persistence/tree";

const roots: string[] = [];

afterEach(() => {
    for (const root of roots.splice(0)) {
        makeWritable(root);
        rmSync(root, { recursive: true, force: true });
    }
});

describe("integration registry privileged storage cleanup", () => {
    test("rejects a symlinked cleanup root without chmod or traversal", async () => {
        const root = fixtureRoot();
        const external = join(root, "external");
        mkdirSync(external, { mode: 0o700 });
        writeFileSync(join(external, "sentinel"), "untouched");
        const target = join(root, "target");
        symlinkSync(external, target);

        await expect(removeImmutableTreeIfExists(target)).rejects.toThrow(/symlinked integration registry tree/);

        expect(lstatSync(target).isSymbolicLink()).toBe(true);
        expect(statSync(external).mode & 0o777).toBe(0o700);
        expect(readFileSync(join(external, "sentinel"), "utf8")).toBe("untouched");
    });

    test("detaches a tree but fails closed when a child is substituted by a symlink", async () => {
        const root = fixtureRoot();
        const external = join(root, "external");
        mkdirSync(external, { mode: 0o700 });
        writeFileSync(join(external, "sentinel"), "untouched");
        const target = join(root, "target");
        mkdirSync(target, { mode: 0o750 });
        symlinkSync(external, join(target, "substituted"));
        chmodSync(target, 0o550);

        await expect(removeImmutableTreeIfExists(target)).rejects.toThrow(/symlinked integration registry entry/);

        expect(existsSync(target)).toBe(false);
        expect(readdirSync(root).some((entry) => entry.startsWith(".target.") && entry.endsWith(".cleanup"))).toBe(
            true,
        );
        expect(statSync(external).mode & 0o777).toBe(0o700);
        expect(readFileSync(join(external, "sentinel"), "utf8")).toBe("untouched");
    });
});

function fixtureRoot(): string {
    const root = mkdtempSync(join(tmpdir(), "cms-integration-storage-safety-"));
    roots.push(root);
    return root;
}

function makeWritable(path: string): void {
    const metadata = lstatSync(path);
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
        return;
    }
    chmodSync(path, 0o750);
    for (const entry of readdirSync(path, { withFileTypes: true })) {
        if (entry.isDirectory() && !entry.isSymbolicLink()) {
            makeWritable(join(path, entry.name));
        }
    }
}
