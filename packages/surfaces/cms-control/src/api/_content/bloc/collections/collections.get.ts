import type { ControlCms } from "cms-control/ControlCms";
import type { SiteBlocCollection } from "@bernouy/cms-content";

export type SiteBlocCollectionsResponse = SiteBlocCollection[];

export default async function getSiteBlocCollections(_req: Request, cms: ControlCms): Promise<Response> {
    return Response.json(await cms.repository.getSiteBlocCollections());
}
