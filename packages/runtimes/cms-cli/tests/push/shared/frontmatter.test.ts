import { describe, test, expect } from "bun:test";
import { parseFrontmatter } from "cms-cli/push/shared/frontmatter/frontmatter";

describe("parseFrontmatter", () => {
    test("returns empty frontmatter + raw body when no header is present", () => {
        const { frontmatter, content } = parseFrontmatter("<p>hello</p>\n");
        expect(frontmatter).toEqual({});
        expect(content).toBe("<p>hello</p>\n");
    });

    test("parses every supported scalar key, stripping quotes", () => {
        const raw = `---
title: "About"
description: 'Our story'
visible: false
indexing: {"mode":"entity","sourceUrn":"urn:commerce","entityId":"product-by-slug","pageQueryParam":"product"}
tags: [public, "marketing", 'top']
---
<bloc-card></bloc-card>`;
        const { frontmatter, content } = parseFrontmatter(raw);
        expect(frontmatter).toEqual({
            title: "About",
            description: "Our story",
            visible: false,
            indexing: {
                mode: "entity",
                sourceUrn: "urn:commerce",
                entityId: "product-by-slug",
                pageQueryParam: "product",
            },
            tags: ["public", "marketing", "top"],
        });
        expect(content).toBe("<bloc-card></bloc-card>");
    });

    test("parses template keys (name, description)", () => {
        const raw = `---
name: "Header global"
description: "Navbar shared across pages"
---
<nav></nav>`;
        const { frontmatter } = parseFrontmatter(raw);
        expect(frontmatter).toEqual({
            name: "Header global",
            description: "Navbar shared across pages",
        });
    });

    test("rejects category — derived from the parent folder name", () => {
        const raw = `---\nname: "X"\ncategory: "Layout"\n---\n`;
        expect(() => parseFrontmatter(raw)).toThrow(/category.*derived from the parent folder/);
    });

    test("ignores blank lines and # comments", () => {
        const raw = `---

# header
title: A

# trailing
---
body`;
        expect(parseFrontmatter(raw).frontmatter.title).toBe("A");
    });

    test("rejects unknown keys explicitly", () => {
        const raw = `---\nfoo: bar\n---\nbody`;
        expect(() => parseFrontmatter(raw)).toThrow(/Unknown frontmatter key/);
    });

    test("rejects malformed visible / tags", () => {
        expect(() => parseFrontmatter(`---\nvisible: maybe\n---\n`)).toThrow(/visible/);
        expect(() => parseFrontmatter(`---\ntags: a, b\n---\n`)).toThrow(/tags/);
    });

    test("rejects malformed indexing JSON and invalid indexing contracts", () => {
        expect(() => parseFrontmatter(`---\nindexing: nope\n---\n`)).toThrow(/indexing.*invalid/);
        expect(() => parseFrontmatter(`---\nindexing: {"mode":"entity"}\n---\n`)).toThrow(/indexing.*invalid/);
    });
});
