import type { ControlCms } from "cms-control/ControlCms";
import { ContentValidationError } from "@bernouy/cms-content";
import { importSiteBlocDefinition } from "cms-control/core/content/siteBloc/cliImport";

export default async function postSiteBuilderBloc(req: Request, cms: ControlCms) {
    const form = await req.formData();
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
