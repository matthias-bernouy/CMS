import { requireCmsRequest } from "./core/auth.ts";
import { handleError, json, withMethod } from "./core/http.ts";
import { stageAcceptance, commitAcceptance } from "./routes/acceptances.ts";
import { listAcceptances } from "./routes/audit.ts";
import { syncContext } from "./routes/configuration.ts";
import { getRequirements } from "./routes/requirements.ts";

export async function handleConsentRequest(request: Request): Promise<Response> {
    try {
        requireCmsRequest(request);
        const route = routePath(request);
        if (route === "/health") {
            return await withMethod(request, "GET", async () => json({ ok: true }));
        }
        if (route === "/requirements") {
            return await withMethod(request, "GET", () => getRequirements(request));
        }
        if (route === "/context/sync") {
            return await withMethod(request, "POST", () => syncContext(request));
        }
        if (route === "/acceptances/stage") {
            return await withMethod(request, "POST", () => stageAcceptance(request));
        }
        if (route === "/acceptances/commit") {
            return await withMethod(request, "POST", () => commitAcceptance(request));
        }
        if (route === "/acceptances") {
            return await withMethod(request, "GET", () => listAcceptances(request));
        }
        return json({ error: "not found" }, 404);
    } catch (error) {
        return handleError(error);
    }
}

function routePath(request: Request): string {
    const pathname = new URL(request.url).pathname.replace(/\/+$/, "");
    const marker = "/cms-consent";
    const index = pathname.indexOf(marker);
    return index === -1 ? pathname || "/" : pathname.slice(index + marker.length) || "/";
}
