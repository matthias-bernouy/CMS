import type { ControlCms } from "src/control/ControlCms";

/**
 * Returns the list of tags (pages) or categories (snippets/templates)
 * currently in use, along with the count of how many times each appears.
 * Used by the <p9r-tag-suggest> autocomplete to surface existing values.
 *
 * Query: `?resource=pages|snippets|templates`
 * Response: `[{ value: string, count: number }]` sorted by count desc.
 */
export default async function getTags(req: Request, cms: ControlCms) {
    const url = new URL(req.url);
    const resource = url.searchParams.get("resource");

    if (resource !== "pages" && resource !== "snippets" && resource !== "templates") {
        return new Response(
            `Invalid resource "${resource}". Expected "pages", "snippets" or "templates".`,
            { status: 400 },
        );
    }

    const counts = new Map<string, number>();

    if (resource === "pages") {
        const pages = await cms.repository.getAllPages();
        for (const page of pages) {
            const tags = normalizeTags(page.tags);
            for (const tag of tags) counts.set(tag, (counts.get(tag) || 0) + 1);
        }
    } else if (resource === "snippets") {
        const snippets = await cms.repository.getAllSnippets();
        for (const snippet of snippets) {
            if (snippet.category) counts.set(snippet.category, (counts.get(snippet.category) || 0) + 1);
        }
    } else {
        const templates = await cms.repository.getAllTemplates();
        for (const template of templates) {
            if (template.category) counts.set(template.category, (counts.get(template.category) || 0) + 1);
        }
    }

    const result = Array.from(counts.entries())
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count);

    return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json" },
    });
}

function normalizeTags(raw: unknown): string[] {
    if (Array.isArray(raw)) return raw.filter((t): t is string => typeof t === "string");
    if (typeof raw === "string" && raw.trim().startsWith("[")) {
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed.filter((t): t is string => typeof t === "string");
        } catch { /* fall through */ }
    }
    return [];
}
