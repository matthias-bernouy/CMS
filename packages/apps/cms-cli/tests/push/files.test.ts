import { describe, test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join, sep } from "node:path";
import { tmpdir } from "node:os";
import { scanFiles } from "cms-cli/push/files/scan";
import type { LocalFile } from "cms-cli/push/files/scan";
import { classifyFiles } from "cms-cli/push/files/classify";
import type { RemoteFile } from "cms-cli/push/files/classify";
import type { PushState } from "cms-cli/push/shared/state";

/** Pass `{ "images/hero.png": "bytes" }`; mirrors the on-disk media tree. */
function makeSite(files: Record<string, string>): string {
    const root = mkdtempSync(join(tmpdir(), "p9r-files-"));
    for (const [rel, content] of Object.entries(files)) {
        const abs = join(root, "files", ...rel.split("/"));
        mkdirSync(join(abs, ".."), { recursive: true });
        writeFileSync(abs, content);
    }
    return root;
}

function local(path: string, hash: string, size = 1): LocalFile {
    const name = path.split("/").pop()!;
    return { path, name, dir: path.slice(0, path.length - name.length).replace(/\/$/, ""), abs: "", size, hash };
}

const emptyState = (): PushState => ({ tenant: "", lastPulled: "", entities: {} });

describe("scanFiles", () => {
    test("walks the media tree, deriving path/name/dir and hashing bytes", async () => {
        const dir = makeSite({
            "logo.png":         "A",
            "images/hero.png":  "BB",
            "images/icons/x.svg": "CCC",
        });
        const files = await scanFiles(dir);

        expect(files.map(f => f.path)).toEqual(["images/hero.png", "images/icons/x.svg", "logo.png"]);

        const hero = files.find(f => f.path === "images/hero.png")!;
        expect(hero.name).toBe("hero.png");
        expect(hero.dir).toBe("images");
        expect(hero.size).toBe(2);
        expect(hero.hash).toMatch(/^[0-9a-f]{64}$/);

        const root = files.find(f => f.path === "logo.png")!;
        expect(root.dir).toBe("");
    });

    test("hash changes with content", async () => {
        const a = await scanFiles(makeSite({ "f.txt": "one" }));
        const b = await scanFiles(makeSite({ "f.txt": "two" }));
        expect(a[0]!.hash).not.toBe(b[0]!.hash);
    });

    test("skips dotfiles", async () => {
        const dir = makeSite({ "keep.txt": "x", ".DS_Store": "junk" });
        const files = await scanFiles(dir);
        expect(files.map(f => f.name)).toEqual(["keep.txt"]);
    });

    test("returns empty list when files/ is missing", async () => {
        const dir = mkdtempSync(join(tmpdir(), "p9r-nofiles-"));
        expect(await scanFiles(dir)).toEqual([]);
    });

    test("computes a POSIX path even on platforms using a different separator", async () => {
        const dir = makeSite({ "a/b.txt": "x" });
        const files = await scanFiles(dir);
        expect(files[0]!.path).toBe("a/b.txt");
        // sanity: the joined fs path used the platform separator, the tree path did not
        if (sep !== "/") expect(files[0]!.path).not.toContain(sep);
    });
});

describe("classifyFiles", () => {
    const remote = (entries: Record<string, RemoteFile>) => new Map(Object.entries(entries));

    test("flags `new` when the path is absent remotely", () => {
        const out = classifyFiles([local("a.png", "h")], remote({}), emptyState(), false);
        expect(out[0]!.status).toBe("new");
        expect(out[0]!.remoteId).toBeNull();
    });

    test("flags `unchanged` when local hash matches last-pushed state", () => {
        const state: PushState = {
            tenant: "", lastPulled: "",
            entities: { "file:a.png": { hash: "h", lastSeenRemote: "10" } },
        };
        const out = classifyFiles([local("a.png", "h", 10)], remote({ "a.png": { id: "r1", size: 10 } }), state, false);
        expect(out[0]!.status).toBe("unchanged");
        expect(out[0]!.remoteId).toBe("r1");
    });

    test("flags `update` when local content diverges", () => {
        const state: PushState = {
            tenant: "", lastPulled: "",
            entities: { "file:a.png": { hash: "old", lastSeenRemote: "10" } },
        };
        const out = classifyFiles([local("a.png", "new", 10)], remote({ "a.png": { id: "r1", size: 10 } }), state, false);
        expect(out[0]!.status).toBe("update");
    });

    test("flags `update` for a remote file we never pushed (no prior state)", () => {
        const out = classifyFiles([local("a.png", "h")], remote({ "a.png": { id: "r1", size: 5 } }), emptyState(), false);
        expect(out[0]!.status).toBe("update");
    });

    test("flags `conflict` when the remote size drifted from lastSeenRemote", () => {
        const state: PushState = {
            tenant: "", lastPulled: "",
            entities: { "file:a.png": { hash: "h", lastSeenRemote: "10" } },
        };
        const out = classifyFiles([local("a.png", "h", 10)], remote({ "a.png": { id: "r1", size: 999 } }), state, false);
        expect(out[0]!.status).toBe("conflict");
    });

    test("--force bypasses the conflict check", () => {
        const state: PushState = {
            tenant: "", lastPulled: "",
            entities: { "file:a.png": { hash: "h", lastSeenRemote: "10" } },
        };
        const out = classifyFiles([local("a.png", "h", 10)], remote({ "a.png": { id: "r1", size: 999 } }), state, true);
        expect(out[0]!.status).toBe("unchanged"); // hash still matches → no re-upload needed
    });
});
