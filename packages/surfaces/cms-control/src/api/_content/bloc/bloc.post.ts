import type { ControlCms } from "cms-control/ControlCms";
import { BlocImportError, importBlocArtifact, parseSourceMap } from "cms-control/core/content/bloc/importBlocArtifact";
import { readBoundedFormData } from "@bernouy/http-runner";

const MAX_BLOC_IMPORT_BYTES = 8 * 1024 * 1024;

export default async function importBloc(req: Request, cms: ControlCms) {
    const formData = await readBoundedFormData(req, MAX_BLOC_IMPORT_BYTES);

    const name = formData.get("name") as string;
    const group = formData.get("group") as string;
    const description = (formData.get("description") as string | null) || "";
    const tag = formData.get("tag") as string | null;
    const viewEntry = formData.get("viewJS");
    const viewFile = viewEntry instanceof File ? viewEntry : null;
    const compositionEntry = formData.get("compositionHTML");
    const compositionHTML = typeof compositionEntry === "string" ? compositionEntry : undefined;
    const sourceRaw = formData.get("source");
    const source = parseSourceMap(sourceRaw);
    const force = formData.get("force") === "true";
    const internal = formData.get("internal") === "true";
    const nativeElementTags = formData
        .getAll("nativeElement")
        .filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim()));
    const nativeElement =
        nativeElementTags.length > 0
            ? ({ accepts: nativeElementTags } as import("@bernouy/cms-content").TBloc["nativeElement"])
            : undefined;

    try {
        await importBlocArtifact(cms, {
            name,
            tag: tag ?? "",
            group,
            description,
            internal,
            nativeElement,
            viewJS: viewFile,
            compositionHTML,
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
