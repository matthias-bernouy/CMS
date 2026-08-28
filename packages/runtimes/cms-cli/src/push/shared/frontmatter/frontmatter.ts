import { validatePageIndexingConfiguration, type PageIndexingConfiguration } from "@bernouy/cms-content";

/**
 * Frontmatter shape for pages synchronized by the CLI.
 */
export type Frontmatter = {
    title?: string;
    description?: string;
    visible?: boolean;
    tags?: string[];
    indexing?: PageIndexingConfiguration;
};

export type ParsedDoc = {
    frontmatter: Frontmatter;
    content: string;
};

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/**
 * Minimal flat YAML parser. Scalars and a single-line array `[a, b]`. Throws
 * on unknown keys to keep the schema tight — invalid frontmatter is a bug,
 * not something the caller has to silently work around.
 */
export function parseFrontmatter(raw: string): ParsedDoc {
    const match = FRONTMATTER_RE.exec(raw);
    if (!match) {
        return { frontmatter: {}, content: raw };
    }

    const header = match[1] ?? "";
    const body = match[2] ?? "";
    const fm: Frontmatter = {};

    for (const line of header.split(/\r?\n/)) {
        if (!line.trim() || line.trim().startsWith("#")) {
            continue;
        }
        const colon = line.indexOf(":");
        if (colon === -1) {
            throw new Error(`Frontmatter line missing ':' — "${line}"`);
        }

        const key = line.slice(0, colon).trim();
        const value = line.slice(colon + 1).trim();

        switch (key) {
            case "title":
                fm.title = unquote(value);
                break;
            case "description":
                fm.description = unquote(value);
                break;
            case "visible":
                fm.visible = parseBool(value, key);
                break;
            case "tags":
                fm.tags = parseTags(value);
                break;
            case "indexing":
                fm.indexing = parseIndexing(value);
                break;
            default:
                throw new Error(`Unknown frontmatter key "${key}"`);
        }
    }
    return { frontmatter: fm, content: body };
}

function parseIndexing(value: string): PageIndexingConfiguration {
    try {
        return validatePageIndexingConfiguration(JSON.parse(value));
    } catch (error) {
        throw new Error(`Frontmatter "indexing" is invalid: ${error instanceof Error ? error.message : String(error)}`);
    }
}

function unquote(v: string): string {
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        return v.slice(1, -1);
    }
    return v;
}

function parseBool(v: string, key: string): boolean {
    if (v === "true") {
        return true;
    }
    if (v === "false") {
        return false;
    }
    throw new Error(`Frontmatter "${key}" must be true|false (got "${v}")`);
}

function parseTags(v: string): string[] {
    if (!v) {
        return [];
    }
    if (!v.startsWith("[") || !v.endsWith("]")) {
        throw new Error(`Frontmatter "tags" must be inline array [a, b] (got "${v}")`);
    }
    return v
        .slice(1, -1)
        .split(",")
        .map((s) => unquote(s.trim()))
        .filter(Boolean);
}
