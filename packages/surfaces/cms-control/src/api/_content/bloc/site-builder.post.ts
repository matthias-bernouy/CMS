import type { ControlCms } from "cms-control/ControlCms";
import { ContentValidationError } from "@bernouy/cms-content";
import { readBoundedFormData } from "@bernouy/http-runner";
import { importSiteBlocDefinition } from "cms-control/core/content/siteBloc/cliImport";

const MAX_SITE_BLOC_IMPORT_BYTES = 4 * 1024 * 1024;

export default async function postSiteBuilderBloc(req: Request, cms: ControlCms) {
    const form = await readBoundedFormData(req, MAX_SITE_BLOC_IMPORT_BYTES);
    const tag = text(form, "tag").toLowerCase();
    const definition = await importSiteBlocDefinition(cms, text(form, "definition"), tag, form.get("force") === "true");
    return Response.json(definition);
}

function text(form: FormData, field: string): string {
    const value = form.get(field);
    if (typeof value !== "string" || !value.trim()) {
        throw new ContentValidationError(field, "required");
    }
    return value.trim();
}
