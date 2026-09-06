import type { ControlCms } from "cms-control/ControlCms";
import { blocLibrary } from "cms-control/core/content/blocLibrary";
export type { BlocLibraryResponse } from "cms-control/core/content/blocLibrary/types";

export default async function getBlocLibrary(req: Request, cms: ControlCms): Promise<Response> {
    const url = new URL(req.url);
    const suffix = "/api/bloc/library";
    const basePath = url.pathname.endsWith(suffix) ? url.pathname.slice(0, -suffix.length) : "";
    const text = (name: string) => url.searchParams.get(name)?.trim() || undefined;
    return Response.json(
        await blocLibrary(
            cms,
            {
                collection: text("collection"),
                view: text("view"),
                search: text("search"),
                category: text("category"),
                visibility: text("visibility"),
                bloc: text("bloc"),
            },
            basePath,
        ),
    );
}
