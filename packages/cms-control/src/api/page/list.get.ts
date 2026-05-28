import type { ControlCms } from "cms-control/ControlCms";
import { getPagesList } from "cms-control/core/page/getPagesList";

export default async function getPages(_req: Request, cms: ControlCms) {
    const pages = await getPagesList(cms);
    return new Response(JSON.stringify(pages), {
        headers: { "Content-Type": "application/json" },
    });
}
