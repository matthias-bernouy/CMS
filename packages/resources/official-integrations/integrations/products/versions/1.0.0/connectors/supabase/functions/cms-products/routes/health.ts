import { requireCmsRequest } from "../core/auth.ts";
import { json } from "../core/http.ts";

export async function health(request: Request): Promise<Response> {
    requireCmsRequest(request);
    return json({ ok: true });
}
