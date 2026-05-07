/**
 * Frontmatter shape shared by every push'able resource. Each type only uses
 * the subset it cares about (pages: title/description/visible/tags ;
 * snippets/templates: name/description) — the parser accepts the whole
 * vocabulary and the caller picks. `category` is intentionally absent: it
 * is derived from the parent folder name (see `categoryFolder.ts`).
 */
export type Frontmatter = {
    title?:       string;
    name?:        string;
    description?: string;
    visible?:     boolean;
    tags?:        string[];
};

export type ParsedDoc = {
    frontmatter: Frontmatter;
    content:     string;
};

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/**
 * Minimal flat YAML parser. Scalars and a single-line array `[a, b]`. Throws
 * on unknown keys to keep the schema tight — invalid frontmatter is a bug,
 * not something the caller has to silently work around.
 */
export function parseFrontmatter(raw: string): ParsedDoc {
    const match = FRONTMATTER_RE.exec(raw);
    if (!match) return { frontmatter: {}, content: raw };

    const header = match[1] ?? "";
    const body   = match[2] ?? "";
    const fm: Frontmatter = {};

    for (const line of header.split(/\r?\n/)) {
        if (!line.trim() || line.trim().startsWith("#")) continue;
        const colon = line.indexOf(":");
        if (colon === -1) throw new Error(`Frontmatter line missing ':' — "${line}"`);

        const key   = line.slice(0, colon).trim();
        const value = line.slice(colon + 1).trim();

        switch (key) {
            case "title":       fm.title       = unquote(value); break;
            case "name":        fm.name        = unquote(value); break;
            case "description": fm.description = unquote(value); break;
            case "visible":     fm.visible     = parseBool(value, key); break;
            case "tags":        fm.tags        = parseTags(value); break;
            case "category":
                throw new Error(
                    `Frontmatter key "category" is no longer supported — ` +
                    `categories are derived from the parent folder name. ` +
                    `Drop the line and place the file under "<resource>/<category>/".`,
                );
            default:            throw new Error(`Unknown frontmatter key "${key}"`);
        }
    }
    return { frontmatter: fm, content: body };
}

function unquote(v: string): string {
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        return v.slice(1, -1);
    }
    return v;
}

function parseBool(v: string, key: string): boolean {
    if (v === "true")  return true;
    if (v === "false") return false;
    throw new Error(`Frontmatter "${key}" must be true|false (got "${v}")`);
}

function parseTags(v: string): string[] {
    if (!v) return [];
    if (!v.startsWith("[") || !v.endsWith("]")) {
        throw new Error(`Frontmatter "tags" must be inline array [a, b] (got "${v}")`);
    }
    return v
        .slice(1, -1)
        .split(",")
        .map(s => unquote(s.trim()))
        .filter(Boolean);
}
