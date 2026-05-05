import type { ControlCms } from "src/control/ControlCms";

export default async function getSnippets(_req: Request, cms: ControlCms) {
    const snippets = await cms.repository.getSnippetsMetadata();
    return new Response(JSON.stringify(snippets), {
        headers: { "Content-Type": "application/json" }
    });
}
