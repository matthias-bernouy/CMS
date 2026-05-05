import type { ControlCms } from "src/control/ControlCms";
import { prepare_bloc } from "src/socle/blocs/prepare_bloc";
import { isValidCustomElementTag } from "src/socle/utils/validation";
import { P9R_CACHE } from "src/socle/constants/p9r-constants";
import { invalidatePagesReferencingBloc } from "src/control/core/server/cache/invalidation";

export default async function importBloc(req: Request, cms: ControlCms) {

    const formData = await req.formData();

    const name = formData.get("name") as string;
    const group = formData.get("group") as string;
    const description = (formData.get("description") as string | null) || "";
    const tag = formData.get("tag") as string | null;
    const viewFile = formData.get("viewJS") as File;
    const editorEntry = formData.get("editorJS");
    const editorFile = editorEntry instanceof File ? editorEntry : null;
    const force = formData.get("force") === "true";

    if (!name || !viewFile || !tag) {
        return new Response("Missing argument (name, tag, viewJS required)", { status: 400 });
    }

    if (!isValidCustomElementTag(tag)) {
        return new Response(
            `Invalid tag "${tag}" — must be a lowercase custom-element name (e.g. "my-card").`,
            { status: 400 },
        );
    }

    const existing = await cms.repository.getBlocViewJS(tag);
    if (existing !== null && !force) {
        return new Response(`Bloc with tag "${tag}" already exists`, { status: 409 });
    }

    const bloc = await prepare_bloc(viewFile, editorFile, name, group, description, tag);

    try {
        if (force) await cms.repository.replaceBloc(bloc);
        else       await cms.repository.createBloc(bloc);
    } catch (e) {
        if (!force && (e as { code?: number }).code === 11000) {
            return new Response(`Bloc with tag "${bloc.id}" already exists`, { status: 409 });
        }
        throw e;
    }

    // Invalidate caches: per-bloc view bundle (used by Delivery + the dev
    // CLI) and the consolidated admin editor bundle that inlines every
    // bloc's editorJS + viewJS.
    cms.cache.delete(P9R_CACHE.bloc(bloc.id));
    cms.cache.delete(P9R_CACHE.EDITOR_SCRIPT);

    // Rendered pages embedding this bloc now carry a stale `?v=<hash>` in
    // their `<script src="/bloc?tag=...">` tag — re-render them on next hit.
    // Pages that don't reference this bloc keep their cached HTML (and the
    // image-optimization srcsets already baked in).
    await invalidatePagesReferencingBloc(cms, bloc.id);

    return new Response("Bloc imported");
}