import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseFrontmatter } from "cms-cli/push/shared/frontmatter";
import { folderToCategory } from "cms-cli/push/shared/categoryFolder";
import { isValidCategoryFolder } from "@bernouy/cms-content";

export type TemplateMeta = {
    name: string;
    description: string;
    category: string;
};

export type LocalTemplate = {
    /** Filename without extension — primary key on the server. */
    identifier: string;
    file: string;
    meta: TemplateMeta;
    content: string;
    hash: string;
};

const TEMPLATES_SUBDIR = "templates";

/**
 * Walks `<siteDir>/templates/<category>/<identifier>.html`. Each direct
 * subfolder names a category (use `_uncategorized/` for the empty
 * category). Loose `.html` files at the root are rejected so the layout
 * stays canonical.
 */
export async function scanTemplates(siteDir: string): Promise<LocalTemplate[]> {
    const root = join(siteDir, TEMPLATES_SUBDIR);
    if (!existsSync(root)) {
        return [];
    }

    const entries = await readdir(root, { withFileTypes: true });
    for (const e of entries) {
        if (!e.isDirectory() && e.name.endsWith(".html")) {
            throw new Error(
                `Loose template "${e.name}" at the root of ${TEMPLATES_SUBDIR}/ — ` +
                    `move it under ${TEMPLATES_SUBDIR}/<category>/ (or ${TEMPLATES_SUBDIR}/_uncategorized/).`,
            );
        }
    }

    const templates: LocalTemplate[] = [];
    for (const dir of entries) {
        if (!dir.isDirectory() || !isValidCategoryFolder(dir.name)) {
            continue;
        }
        const category = folderToCategory(dir.name);
        const folder = join(root, dir.name);
        const files = (await readdir(folder)).filter((f) => f.endsWith(".html") && !f.startsWith("."));
        for (const file of files) {
            const identifier = file.slice(0, -".html".length);
            const raw = await readFile(join(folder, file), "utf-8");
            const { frontmatter, content } = parseFrontmatter(raw);
            const meta: TemplateMeta = {
                name: frontmatter.name ?? identifier,
                description: frontmatter.description ?? "",
                category,
            };
            templates.push({
                identifier,
                file: `${TEMPLATES_SUBDIR}/${dir.name}/${file}`,
                meta,
                content,
                hash: canonicalTemplateHash({ ...meta, content }),
            });
        }
    }
    return templates;
}

export function canonicalTemplateHash(payload: TemplateMeta & { content: string }): string {
    const canonical = JSON.stringify({
        name: payload.name,
        description: payload.description,
        category: payload.category,
        content: payload.content,
    });
    return createHash("sha256").update(canonical).digest("hex");
}
