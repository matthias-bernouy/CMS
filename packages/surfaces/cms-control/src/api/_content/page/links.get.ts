import type { ControlCms } from "cms-control/ControlCms";

export default async function getLinks(req: Request, cms: ControlCms) {
    const publishedOnly = new URL(req.url).searchParams.get("visible") === "published";
    const links = publishedOnly
        ? (await cms.repository.getPagesMetadata({ visible: "published", sortBy: "title", sortOrder: "asc" })).map(
              ({ path, title }) => ({ path, title }),
          )
        : await cms.repository.getLinks();

    return Response.json(links);
}
