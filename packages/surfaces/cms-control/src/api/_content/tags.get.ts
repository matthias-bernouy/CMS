import type { ControlCms } from "cms-control/ControlCms";

/**
 * Returns the list of page tags
 * currently in use, along with the count of how many times each appears.
 * Used by tag and token autocomplete controls to surface existing values.
 *
 * Query: `?resource=pages`
 * Response: `[{ value: string, count: number }]` sorted by count desc.
 */
export default async function getTags(req: Request, cms: ControlCms) {
    const url = new URL(req.url);
    const resource = url.searchParams.get("resource");

    if (resource !== "pages") {
        return new Response(`Invalid resource "${resource}". Expected "pages".`, { status: 400 });
    }

    const result = await cms.repository.getTagCounts();

    return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json" },
    });
}
