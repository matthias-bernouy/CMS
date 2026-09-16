import type { ControlCms } from "cms-control/ControlCms";
import { collectionWorkspace } from "cms-control/core/content/collectionWorkspace";
import { isCollectionWorkspaceSection } from "cms-control/core/content/collectionWorkspace/routes";
export type { CollectionWorkspaceResponse } from "cms-control/core/content/collectionWorkspace/types";

export default async function getCollectionWorkspace(req: Request, cms: ControlCms): Promise<Response> {
    const url = new URL(req.url);
    const suffix = "/api/collections/workspace";
    const basePath = url.pathname.endsWith(suffix) ? url.pathname.slice(0, -suffix.length) : "";
    const text = (name: string) => url.searchParams.get(name)?.trim() || undefined;
    const requestedSection = text("section");
    if (requestedSection && !isCollectionWorkspaceSection(requestedSection)) {
        throw Object.assign(new Error("Collection section not found"), { status: 404 });
    }
    const section = requestedSection && isCollectionWorkspaceSection(requestedSection) ? requestedSection : undefined;
    return Response.json(
        await collectionWorkspace(
            cms,
            {
                collection: text("collection"),
                section,
                bloc: text("bloc"),
                token: text("token"),
                theme: text("theme"),
            },
            basePath,
        ),
    );
}
