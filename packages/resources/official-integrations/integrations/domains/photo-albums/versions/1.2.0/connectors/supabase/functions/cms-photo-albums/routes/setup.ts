import { json, methodNotAllowed } from "../core/http.ts";
import { ensurePhotoBucket } from "../media/storage.ts";

export async function handleSetupRoute(route: string, request: Request): Promise<Response | null> {
    if (route === "/health") {
        return request.method === "GET" ? json({ ok: true }) : methodNotAllowed("GET");
    }
    if (route === "/setup") {
        if (request.method !== "POST") {
            return methodNotAllowed("POST");
        }
        await ensurePhotoBucket();
        return json({ ok: true });
    }
    return null;
}
