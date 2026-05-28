import { describe, test, expect } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scanSystem, canonicalSystemHash } from "src/cli/push/system/scan";
import { flatten, projectRemote } from "src/cli/push/system/apply";

function tmpSite(files: Record<string, string>): string {
    const root = mkdtempSync(join(tmpdir(), "p9r-sys-"));
    for (const [name, content] of Object.entries(files)) {
        writeFileSync(join(root, name), content);
    }
    return root;
}

describe("scanSystem", () => {
    test("returns null when neither system.json nor theme.css exist", async () => {
        const dir = tmpSite({});
        expect(await scanSystem(dir)).toBeNull();
    });

    test("inlines theme.css into site.theme", async () => {
        const dir = tmpSite({
            "system.json": JSON.stringify({ site: { name: "Foo" } }),
            "theme.css":   ":root { --x: red; }",
        });
        const local = await scanSystem(dir);
        expect(local?.payload.site.name).toBe("Foo");
        expect(local?.payload.site.theme).toBe(":root { --x: red; }");
    });

    test("collects page refs from notFound + serverError", async () => {
        const dir = tmpSite({
            "system.json": JSON.stringify({
                site: {
                    notFound:    { path: "/404" },
                    serverError: null,
                },
            }),
        });
        const local = await scanSystem(dir);
        expect(local?.pageRefs).toEqual(["/404"]);
    });

    test("hash is stable + sensitive to changes", async () => {
        const dir1 = tmpSite({ "system.json": JSON.stringify({ site: { name: "A" } }) });
        const dir2 = tmpSite({ "system.json": JSON.stringify({ site: { name: "A" } }) });
        const dir3 = tmpSite({ "system.json": JSON.stringify({ site: { name: "B" } }) });
        expect((await scanSystem(dir1))!.hash).toBe((await scanSystem(dir2))!.hash);
        expect((await scanSystem(dir1))!.hash).not.toBe((await scanSystem(dir3))!.hash);
    });
});

describe("flatten", () => {
    test("emits dotted keys, page refs as path strings", () => {
        const body = flatten({
            site: {
                name:        "Foo",
                language:    "fr",
                notFound:    { path: "/404" },
                serverError: null,
            },
            editor: { layoutCategory: "Layouts" },
        });
        expect(body).toEqual({
            "site.name":            "Foo",
            "site.language":        "fr",
            "site.notFound":        "/404",
            "site.serverError":     "",
            "editor.layoutCategory": "Layouts",
        });
    });
});

describe("projectRemote", () => {
    test("only keeps keys present in the local payload", () => {
        const local  = { site: { name: "" }, editor: {} };
        const remote = { site: { name: "Foo", host: "bar" }, editor: { layoutCategory: "x" } };
        const out = projectRemote(local, remote);
        expect(out).toEqual({ site: { name: "Foo" }, editor: {} });
    });
});

describe("canonicalSystemHash", () => {
    test("two equivalent payloads share a hash", () => {
        const a = { site: { name: "X" }, editor: {} };
        const b = { site: { name: "X" }, editor: {} };
        expect(canonicalSystemHash(a)).toBe(canonicalSystemHash(b));
    });
});
