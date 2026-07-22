import type { Frontmatter } from "./frontmatter";

/**
 * Serialize a `Frontmatter` object back to its on-disk YAML form. Pairs with
 * `parseFrontmatter` — round-trip identity for any input the parser accepts.
 * Used by `p9r pull` to materialize remote entities and by the dev-mode
 * `LocalFsCmsRepository` to persist editor saves.
 *
 * The output format is intentionally narrow (one scalar per line, single-line
 * tag arrays, double-quoted strings). No comments, no flow-style maps, no
 * blank lines — a pretty-printer would add noise the parser already tolerates.
 */
export function serializeFrontmatter(fm: Frontmatter): string {
    const lines: string[] = ["---"];
    for (const [key, value] of orderedEntries(fm)) {
        lines.push(`${key}: ${formatValue(key, value)}`);
    }
    lines.push("---", "");
    return lines.join("\n");
}

/**
 * Stable key order so the same frontmatter object always produces the same
 * file content. Pages share `description` with templates, so the order is
 * split into "intro" + "scalars" + "tags last".
 */
function orderedEntries(fm: Frontmatter): [string, unknown][] {
    const KEY_ORDER = ["title", "name", "description", "visible", "tags"] as const;
    const out: [string, unknown][] = [];
    for (const k of KEY_ORDER) {
        if (fm[k as keyof Frontmatter] !== undefined) {
            out.push([k, fm[k as keyof Frontmatter]]);
        }
    }
    return out;
}

function formatValue(key: string, value: unknown): string {
    if (key === "tags" && Array.isArray(value)) {
        return `[${value.map(quote).join(", ")}]`;
    }
    if (typeof value === "boolean") {
        return String(value);
    }
    return quote(String(value ?? ""));
}

function quote(v: string): string {
    return `"${(v ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
