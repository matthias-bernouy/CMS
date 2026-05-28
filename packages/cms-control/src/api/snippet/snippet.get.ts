import type { ControlCms } from "src/control/ControlCms";
import MissingParam from "src/control/errors/Http/MissingParam";
import InvalidParam from "src/control/errors/Http/InvalidParam";

/**
 * Fetch a single snippet by either `?id=` (system-generated, used by the
 * editor) or `?identifier=` (user-chosen, used by the runtime
 * `<w13c-snippet>` element which only knows the identifier from its HTML
 * attribute). Both keys are unique; whichever is supplied is honored.
 */
export default async function getSnippet(req: Request, cms: ControlCms) {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    const identifier = url.searchParams.get("identifier");

    if (!id && !identifier) throw new MissingParam("id");

    const snippet = id
        ? await cms.repository.getSnippetById(id)
        : await cms.repository.getSnippetByIdentifier(identifier!);

    if (!snippet) {
        const param = id ? "id" : "identifier";
        throw new InvalidParam(param, `Unknown snippet ${param}.`);
    }

    return new Response(JSON.stringify(snippet), {
        headers: { "Content-Type": "application/json" }
    });
}
