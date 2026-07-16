import { listCampaigns, getCampaign, retryFailed, setCampaignStatus } from "./campaigns.ts";
import { requireCmsRequest } from "./env.ts";
import { handleError, json, optionsResponse, routePath, withMethod } from "./http.ts";
import { tick } from "./tick.ts";

Deno.serve(async (request) => {
    try {
        if (request.method === "OPTIONS") return optionsResponse();
        requireCmsRequest(request);

        const route = routePath(request);
        if (route === "/health") return await withMethod(request, "GET", () => health());
        if (route === "/tick") return await withMethod(request, "POST", () => tick());
        if (route === "/campaigns") return await campaignsRoute(request);
        if (route === "/campaign") return await withMethod(request, "GET", () => getCampaign(request));
        if (route === "/campaign/pause") return await withMethod(request, "POST", () => setCampaignStatus(request, "paused"));
        if (route === "/campaign/cancel") return await withMethod(request, "POST", () => setCampaignStatus(request, "canceled"));
        if (route === "/campaign/retry-failed") return await withMethod(request, "POST", () => retryFailed(request));

        return json({ error: "not found" }, 404);
    } catch (error) {
        return handleError(error);
    }
});

async function campaignsRoute(request: Request): Promise<Response> {
    if (request.method === "GET") return listCampaigns(request);
    return new Response("Method Not Allowed", {
        status: 405,
        headers: { allow: "GET, OPTIONS" },
    });
}

async function health(): Promise<Response> {
    return json({ ok: true });
}
