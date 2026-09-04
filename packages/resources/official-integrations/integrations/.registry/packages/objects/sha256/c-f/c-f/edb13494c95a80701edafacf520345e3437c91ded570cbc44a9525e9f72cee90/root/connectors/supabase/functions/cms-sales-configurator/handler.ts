import { requireCmsRequest } from "./core/auth.ts";
import { handleError, json, optionsResponse } from "./core/http.ts";
import { handleAdminRoute } from "./routing/admin.ts";
import { handlePartnerRoute } from "./routing/partner.ts";
import { handlePublicRoute } from "./routing/public.ts";

const routeHandlers = [handlePublicRoute, handlePartnerRoute, handleAdminRoute];

export async function handleSalesConfiguratorRequest(request: Request): Promise<Response> {
    try {
        if (request.method === "OPTIONS") {
            return optionsResponse();
        }
        requireCmsRequest(request);
        const route = routePath(request);
        for (const handler of routeHandlers) {
            const response = await handler(route, request);
            if (response) {
                return response;
            }
        }
        return json({ error: "not found" }, 404);
    } catch (error) {
        return handleError(error);
    }
}

function routePath(request: Request): string {
    const pathname = new URL(request.url).pathname.replace(/\/+$/, "");
    const marker = "/cms-sales-configurator";
    const index = pathname.indexOf(marker);
    if (index === -1) {
        return pathname || "/";
    }
    return pathname.slice(index + marker.length) || "/";
}
