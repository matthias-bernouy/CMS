import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseFrontmatter } from "../shared/frontmatter";

export type TemplateMeta = {
    name:        string;
    description: string;
    category:    string;
};

export type LocalTemplate = {
    /** Filename without extension — primary key on the server. */
    identifier: string;
    file:       string;
    meta:       TemplateMeta;
    content:    string;
    hash:       string;
};

const TEMPLATES_SUBDIR = "templates";

export async function scanTemplates(siteDir: string): Promise<LocalTemplate[]> {
    const root = join(siteDir, TEMPLATES_SUBDIR);
    if (!existsSync(root)) return [];

    const entries = (await readdir(root))
        .filter(e => e.endsWith(".html") && !e.startsWith("."));

    const templates: LocalTemplate[] = [];
    for (const file of entries) {
        const identifier = file.slice(0, -".html".length);
        const raw        = await readFile(join(root, file), "utf-8");
        const { frontmatter, content } = parseFrontmatter(raw);
        const meta: TemplateMeta = {
            name:        frontmatter.name        ?? identifier,
            description: frontmatter.description ?? "",
            category:    frontmatter.category    ?? "",
        };
        templates.push({
            identifier,
            file:    `${TEMPLATES_SUBDIR}/${file}`,
            meta,
            content,
            hash:    canonicalTemplateHash({ ...meta, content }),
        });
    }
    return templates;
}

export function canonicalTemplateHash(payload: TemplateMeta & { content: string }): string {
    const canonical = JSON.stringify({
        name:        payload.name,
        description: payload.description,
        category:    payload.category,
        content:     payload.content,
    });
    return createHash("sha256").update(canonical).digest("hex");
}
