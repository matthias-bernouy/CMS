import type { ControlCms } from "cms-control/ControlCms";
import { readJsonBody } from "cms-control/core/admin/http/readJsonBody";
import { updatePageContent } from "cms-control/core/content/page/updatePageContent";
import { parsePageContentUpdateDto } from "cms-control/core/validation/page/parseContentUpdateDto";

export default async function putPageContent(req: Request, cms: ControlCms): Promise<Response> {
    const body = await readJsonBody(req);
    await updatePageContent(cms, parsePageContentUpdateDto(body));
    return new Response(null, { status: 204 });
}
