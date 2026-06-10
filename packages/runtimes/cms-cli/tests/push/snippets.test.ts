import { describe, test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join, sep } from "node:path";
import { tmpdir } from "node:os";
import { scanSnippets, canonicalSnippetHash } from "cms-cli/push/snippets/scan";
import { classifySnippets } from "cms-cli/push/snippets/classify";
import type { LocalSnippet } from "cms-cli/push/snippets/scan";
import type { PushState } from "cms-cli/push/shared/state";

/** Pass `{ "<category>/<file.html>": content }`; mirrors the on-disk layout. */
function makeSite(files: Record<string, string>): string {
    const root = mkdtempSync(join(tmpdir(), "p9r-test-"));
    mkdirSync(join(root, "snippets"));
    for (const [rel, content] of Object.entries(files)) {
        const [category, name] = rel.split("/");
        if (!category || !name) throw new Error(`fixture key "${rel}" must be "<category>/<file>"`);
        const dir = join(root, "snippets", category);
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, name), content);
    }
    return root;
}

function snippet(identifier: string, hash: string): LocalSnippet {
    return {
        identifier,
        file:    `snippets${sep}_uncategorized${sep}${identifier}.html`,
        meta:    { name: identifier, description: "", category: "" },
        content: "",
        hash,
    };
}

const emptyState = (): PushState => ({ tenant: "", lastPulled: "", entities: {} });

describe("scanSnippets", () => {
    test("derives identifier from filename and category from parent folder", async () => {
        const dir = makeSite({
            "Layout/header.html": `---
name: "Header global"
description: "Top nav"
---
<nav></nav>`,
            "_uncategorized/raw.html": "<footer></footer>",
        });
        const snippets = await scanSnippets(dir);
        expect(snippets.map(s => s.identifier).sort()).toEqual(["header", "raw"]);

        const header = snippets.find(s => s.identifier === "header")!;
        expect(header.meta).toEqual({ name: "Header global", description: "Top nav", category: "Layout" });
        expect(header.content.trim()).toBe("<nav></nav>");

        const raw = snippets.find(s => s.identifier === "raw")!;
        expect(raw.meta.name).toBe("raw"); // defaults to identifier
        expect(raw.meta.category).toBe("");
    });

    test("returns empty list when site/snippets/ is missing", async () => {
        const dir = mkdtempSync(join(tmpdir(), "p9r-empty-"));
        expect(await scanSnippets(dir)).toEqual([]);
    });

    test("rejects loose .html at the root", async () => {
        const root = mkdtempSync(join(tmpdir(), "p9r-loose-"));
        mkdirSync(join(root, "snippets"));
        writeFileSync(join(root, "snippets", "loose.html"), "<x></x>");
        await expect(scanSnippets(root)).rejects.toThrow(/Loose snippet/);
    });
});

describe("canonicalSnippetHash", () => {
    test("changes when meta or content changes", () => {
        const base = { name: "X", description: "", category: "", content: "<p></p>" };
        const h    = canonicalSnippetHash(base);
        expect(canonicalSnippetHash({ ...base, name:    "Y" })).not.toBe(h);
        expect(canonicalSnippetHash({ ...base, content: "<a/>" })).not.toBe(h);
    });
});

describe("classifySnippets", () => {
    test("flags as `new` when no remote match", async () => {
        const out = await classifySnippets([snippet("hdr", "h")], [], emptyState(), async () => "X", false);
        expect(out[0]?.status).toBe("new");
    });

    test("flags as `unchanged` when local hash matches remote hash", async () => {
        const out = await classifySnippets(
            [snippet("hdr", "same")],
            [{ id: "s1", identifier: "hdr" }],
            emptyState(),
            async () => "same",
            false,
        );
        expect(out[0]?.status).toBe("unchanged");
    });

    test("flags as `conflict` when remote drifted from lastSeenRemote", async () => {
        const state: PushState = {
            tenant: "", lastPulled: "",
            entities: { "snippet:hdr": { hash: "old", lastSeenRemote: "old" } },
        };
        const out = await classifySnippets(
            [snippet("hdr", "loc")],
            [{ id: "s1", identifier: "hdr" }],
            state,
            async () => "drifted",
            false,
        );
        expect(out[0]?.status).toBe("conflict");
    });
});
