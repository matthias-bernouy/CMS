import { describe, expect, test } from "bun:test";
import { serializeFrontmatter } from "cms-cli/push/shared/frontmatter/frontmatterWrite";

describe("serializeFrontmatter", () => {
    test("writes supported values in stable order and escapes quoted strings", () => {
        const serialized = serializeFrontmatter({
            tags: ["featured", 'say "hello"'],
            visible: false,
            description: "A \\ path",
            title: 'A "quoted" title',
            indexing: { mode: "disabled" },
        });

        expect(serialized).toBe(`---
title: "A \\"quoted\\" title"
description: "A \\\\ path"
visible: false
indexing: {"mode":"disabled"}
tags: ["featured", "say \\"hello\\""]
---
`);
    });

    test("omits absent keys while retaining empty scalar values", () => {
        expect(serializeFrontmatter({ name: "", description: undefined })).toBe(`---
name: ""
---
`);
    });
});
