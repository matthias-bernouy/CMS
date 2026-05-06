import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseFrontmatter } from "../shared/frontmatter";

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

export async function scanSnippets(siteDir: string): Promise<LocalSnippet[]> {
    const root = join(siteDir, SNIPPETS_SUBDIR);
    if (!existsSync(root)) return [];

    const entries = (await readdir(root))
        .filter(e => e.endsWith(".html") && !e.startsWith("."));

    const snippets: LocalSnippet[] = [];
    for (const file of entries) {
        const identifier = file.slice(0, -".html".length);
        const raw        = await readFile(join(root, file), "utf-8");
        const { frontmatter, content } = parseFrontmatter(raw);
        const meta: SnippetMeta = {
            name:        frontmatter.name        ?? identifier,
            description: frontmatter.description ?? "",
            category:    frontmatter.category    ?? "",
        };
        snippets.push({
            identifier,
            file:    `${SNIPPETS_SUBDIR}/${file}`,
            meta,
            content,
            hash:    canonicalSnippetHash({ ...meta, content }),
        });
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
