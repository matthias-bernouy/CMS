import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { parseFrontmatter } from "../shared/frontmatter";

export type PageFrontmatter = {
    title: string;
    description: string;
    visible: boolean;
    tags: string[];
};

export type LocalPage = {
    /** URL path served by the CMS (e.g. `/`, `/about`, `/blog/post-1`). */
    path: string;
    /** Filesystem path relative to siteDir, kept for error messages. */
    file: string;
    frontmatter: PageFrontmatter;
    /** HTML body — frontmatter stripped. */
    content: string;
    /** sha256 of the canonical payload (frontmatter fields + content). */
    hash: string;
};

const PAGES_SUBDIR = "pages";

/**
 * Scan `<siteDir>/pages/` for .html files and return a list of pages keyed
 * by their URL path. Returns [] when the folder doesn't exist.
 */
export async function scanPages(siteDir: string): Promise<LocalPage[]> {
    const root = join(siteDir, PAGES_SUBDIR);
    if (!existsSync(root)) {
        return [];
    }

    const files: string[] = [];
    await walk(root, files);

    const pages: LocalPage[] = [];
    for (const file of files) {
        const raw = await readFile(file, "utf-8");
        const { frontmatter, content } = parseFrontmatter(raw);
        const fm: PageFrontmatter = {
            title: frontmatter.title ?? "",
            description: frontmatter.description ?? "",
            visible: frontmatter.visible ?? true,
            tags: frontmatter.tags ?? [],
        };
        pages.push({
            path: fileToUrlPath(relative(root, file)),
            file: relative(siteDir, file),
            frontmatter: fm,
            content,
            hash: canonicalHash({ ...fm, content }),
        });
    }
    return pages;
}

/**
 * Stable hash of a page payload, recomputed identically on the remote side so
 * equality means "same content". This is the comparison projection (tags sorted),
 * not the wire payload.
 */
export function canonicalHash(payload: PageFrontmatter & { content: string }): string {
    const canonical = JSON.stringify({
        title: payload.title,
        description: payload.description,
        visible: payload.visible,
        tags: [...payload.tags].sort(),
        content: payload.content,
    });
    return createHash("sha256").update(canonical).digest("hex");
}

async function walk(dir: string, out: string[]): Promise<void> {
    const entries = await readdir(dir);
    for (const entry of entries) {
        if (entry.startsWith(".")) {
            continue;
        }
        const full = join(dir, entry);
        const s = await stat(full);
        if (s.isDirectory()) {
            await walk(full, out);
        } else if (s.isFile() && entry.endsWith(".html")) {
            out.push(full);
        }
    }
}

function fileToUrlPath(rel: string): string {
    const noExt = rel.replace(/\.html$/, "");
    const segments = noExt.split(sep).filter((s) => s !== "index");
    if (segments.length === 0) {
        return "/";
    }
    return "/" + segments.join("/");
}
