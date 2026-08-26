import type { ControlCms } from "cms-control/ControlCms";
import { BlocImportError, importBlocArtifact, parseSourceMap } from "cms-control/core/content/bloc/importBlocArtifact";

export default async function importBloc(req: Request, cms: ControlCms) {
    const formData = await req.formData();

    const name = formData.get("name") as string;
    const group = formData.get("group") as string;
    const description = (formData.get("description") as string | null) || "";
    const tag = formData.get("tag") as string | null;
    const viewEntry = formData.get("viewJS");
    const viewFile = viewEntry instanceof File ? viewEntry : null;
    const compositionEntry = formData.get("compositionHTML");
    const compositionHTML = typeof compositionEntry === "string" ? compositionEntry : undefined;
    const editorEntry = formData.get("editorJS");
    const editorFile = editorEntry instanceof File ? editorEntry : null;
    const sourceRaw = formData.get("source");
    const source = parseSourceMap(sourceRaw);
    const force = formData.get("force") === "true";
    const internal = formData.get("internal") === "true";

    try {
        await importBlocArtifact(cms, {
            name,
            tag: tag ?? "",
            group,
            description,
            internal,
            viewJS: viewFile,
            compositionHTML,
            editorJS: editorFile,
            source,
            force,
        });
    } catch (error) {
        if (error instanceof BlocImportError) {
            return new Response(error.message, { status: error.status });
        }
        throw error;
    }

    return new Response("Bloc imported");
}
