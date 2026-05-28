import type { ControlCms } from "src/control/ControlCms";
import MissingParam from "src/control/errors/Http/MissingParam";

export default async function getPage(req: Request, cms: ControlCms) {

    const url = new URL(req.url);

    const id = url.searchParams.get("id");

    if ( !id ) throw new MissingParam("id");

    const res = await cms.repository.getPageById(id);

    if (!res) throw new Error("Undefiened");

    const webFormat = {
        ...res,
        visible: res.visible ? "on" : "off",
        tags: res.tags.join(",")
    }

    return new Response(JSON.stringify(webFormat));
}
