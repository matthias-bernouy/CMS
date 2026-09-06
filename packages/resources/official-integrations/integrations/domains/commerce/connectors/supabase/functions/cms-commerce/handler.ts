import { requireCmsRequest } from "./core/auth.ts";
import { handleError, json, optionsResponse, methodNotAllowed } from "./core/http.ts";
import { manageCommerce } from "./routes/configuration/management.ts";
import { handleAdminConfigurationRoute } from "./routing/admin-configuration.ts";
import { handleAdminMarketplaceRoute } from "./routing/admin-marketplace.ts";
import { handleCatalogRoute } from "./routing/catalog.ts";
import { handleMarketplaceRoute } from "./routing/marketplace.ts";
import { handleInternalSettlementRoute } from "./routing/internal-settlement.ts";
import { handleNotificationRoute } from "./routing/notifications.ts";

const routeHandlers = [
    handleCatalogRoute,
    handleMarketplaceRoute,
    handleInternalSettlementRoute,
    handleAdminMarketplaceRoute,
    handleAdminConfigurationRoute,
    handleNotificationRoute,
];

export async function handleCommerceRequest(request: Request): Promise<Response> {
    try {
        if (request.method === "OPTIONS") {
            return optionsResponse();
        }
        requireCmsRequest(request);
        const route = routePath(request);
        if (route === "/management") {
            return request.method === "POST" ? await manageCommerce(request) : methodNotAllowed("POST");
        }

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
    const marker = "/cms-commerce";
    const index = pathname.indexOf(marker);
    if (index === -1) {
        return pathname || "/";
    }
    return pathname.slice(index + marker.length) || "/";
}
