import type { ControlCms } from "cms-control/ControlCms";

/**
 * Returns the list of tags (pages) or categories (templates)
 * currently in use, along with the count of how many times each appears.
 * Used by tag and token autocomplete controls to surface existing values.
 *
 * Query: `?resource=pages|templates`
 * Response: `[{ value: string, count: number }]` sorted by count desc.
 */
export default async function getTags(req: Request, cms: ControlCms) {
    const url = new URL(req.url);
    const resource = url.searchParams.get("resource");

    if (resource !== "pages" && resource !== "templates") {
        return new Response(`Invalid resource "${resource}". Expected "pages" or "templates".`, { status: 400 });
    }

    const result =
        resource === "pages" ? await cms.repository.getTagCounts() : await cms.repository.getCategoryCounts(resource);

    return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json" },
    });
}
