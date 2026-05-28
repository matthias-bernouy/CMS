import type { ControlCms } from "src/control/ControlCms";

/**
 * Cheap availability check for a snippet identifier. Used by the snippet
 * configuration dialog to warn the user at creation time that their chosen
 * identifier is already taken. Snippet identifiers are immutable once the
 * snippet exists, so callers never need to pass a `current-identifier`.
 *
 * Query:
 *   - `identifier` : candidate identifier (required)
 *
 * Response: `{ exists: boolean }`
 */
export default async function snippetExists(req: Request, cms: ControlCms) {
    const url = new URL(req.url);
    const identifier = url.searchParams.get("identifier");
    if (!identifier) {
        return new Response("Missing argument `identifier`", { status: 400 });
    }

    const match = await cms.repository.getSnippetByIdentifier(identifier);
    return new Response(JSON.stringify({ exists: match !== null }), {
        headers: { "Content-Type": "application/json" },
    });
}
