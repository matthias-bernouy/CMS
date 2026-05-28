import type { ControlCms } from "src/control/ControlCms";

export default async function getLinks(_req: Request, cms: ControlCms) {

    const links = await cms.repository.getLinks();

    return new Response(JSON.stringify(links), {
        headers: { "Content-Type": "application/json" },
    });

}
