import { describe, test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { bundleBlocSource } from "src/cli/push/blocs/bundle";

function tmpBloc(files: Record<string, string | Buffer>): string {
    const root = mkdtempSync(join(tmpdir(), "p9r-bloc-"));
    for (const [rel, content] of Object.entries(files)) {
        const full = join(root, rel);
        const dir = full.substring(0, full.lastIndexOf("/"));
        mkdirSync(dir, { recursive: true });
        writeFileSync(full, content);
    }
    return root;
}

describe("bundleBlocSource", () => {
    test("encodes every file as base64 keyed by its relative path", async () => {
        const dir = tmpBloc({
            "manifest.json":      `{"default-tag":"x"}`,
            "Bloc.ts":            `export class X {}`,
            "assets/icon.svg":    `<svg/>`,
        });
        const out = await bundleBlocSource(dir);
        expect(Object.keys(out).sort()).toEqual(["Bloc.ts", "assets/icon.svg", "manifest.json"]);
        expect(Buffer.from(out["Bloc.ts"]!,         "base64").toString()).toBe("export class X {}");
        expect(Buffer.from(out["assets/icon.svg"]!, "base64").toString()).toBe("<svg/>");
    });

    test("skips node_modules / dist / dotfiles", async () => {
        const dir = tmpBloc({
            "Bloc.ts":                  "kept",
            "node_modules/foo/index.js": "skip",
            "dist/output.js":            "skip",
            ".env":                      "skip",
            ".git/HEAD":                 "skip",
        });
        const out = await bundleBlocSource(dir);
        expect(Object.keys(out)).toEqual(["Bloc.ts"]);
    });

    test("normalizes path separators to '/'", async () => {
        const dir = tmpBloc({ "deep/nested/file.txt": "hi" });
        const out = await bundleBlocSource(dir);
        expect(Object.keys(out)).toEqual(["deep/nested/file.txt"]);
    });

    test("handles binary files (raw bytes preserved through base64)", async () => {
        const bytes = Buffer.from([0x00, 0xff, 0x42, 0x10]);
        const dir = tmpBloc({ "icon.bin": bytes });
        const out = await bundleBlocSource(dir);
        expect(Buffer.from(out["icon.bin"]!, "base64").equals(bytes)).toBe(true);
    });
});
