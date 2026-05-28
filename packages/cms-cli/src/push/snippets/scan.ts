import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseFrontmatter } from "src/cli/push/shared/frontmatter";
import { folderToCategory } from "src/cli/push/shared/categoryFolder";
import { isValidCategoryFolder } from "src/socle/utils/validation";

export type SnippetMeta = {
    /** Pretty label shown in admin lists. Defaults to identifier when absent. */
    name:        string;
    description: string;
    category:    string;
};

export type LocalSnippet = {
    /** Filename without extension — primary key on the server. */
    identifier: string;
    file:       string;
    meta:       SnippetMeta;
    content:    string;
    hash:       string;
};

const SNIPPETS_SUBDIR = "snippets";

/**
 * Walks `<siteDir>/snippets/<category>/<identifier>.html`. Each direct
 * subfolder names a category (use `_uncategorized/` for the empty
 * category). Loose `.html` files at the root are rejected so the layout
 * stays canonical.
 */
export async function scanSnippets(siteDir: string): Promise<LocalSnippet[]> {
    const root = join(siteDir, SNIPPETS_SUBDIR);
    if (!existsSync(root)) return [];

    const entries = await readdir(root, { withFileTypes: true });
    for (const e of entries) {
        if (!e.isDirectory() && e.name.endsWith(".html")) {
            throw new Error(
                `Loose snippet "${e.name}" at the root of ${SNIPPETS_SUBDIR}/ — ` +
                `move it under ${SNIPPETS_SUBDIR}/<category>/ (or ${SNIPPETS_SUBDIR}/_uncategorized/).`,
            );
        }
    }

    const snippets: LocalSnippet[] = [];
    for (const dir of entries) {
        if (!dir.isDirectory() || !isValidCategoryFolder(dir.name)) continue;
        const category = folderToCategory(dir.name);
        const folder = join(root, dir.name);
        const files = (await readdir(folder)).filter(f => f.endsWith(".html") && !f.startsWith("."));
        for (const file of files) {
            const identifier = file.slice(0, -".html".length);
            const raw        = await readFile(join(folder, file), "utf-8");
            const { frontmatter, content } = parseFrontmatter(raw);
            const meta: SnippetMeta = {
                name:        frontmatter.name        ?? identifier,
                description: frontmatter.description ?? "",
                category,
            };
            snippets.push({
                identifier,
                file:    `${SNIPPETS_SUBDIR}/${dir.name}/${file}`,
                meta,
                content,
                hash:    canonicalSnippetHash({ ...meta, content }),
            });
        }
    }
    return snippets;
}

export function canonicalSnippetHash(payload: SnippetMeta & { content: string }): string {
    const canonical = JSON.stringify({
        name:        payload.name,
        description: payload.description,
        category:    payload.category,
        content:     payload.content,
    });
    return createHash("sha256").update(canonical).digest("hex");
}
