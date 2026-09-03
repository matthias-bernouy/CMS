import { listSellerHeldPaymentCapabilities } from "./core/capabilities.ts";
import { getMarketplaceTermsManagement, publishMarketplaceTermsManagement } from "./core/management.ts";
import { handleError, json, optionsResponse, withMethod } from "./core/runtime.ts";

export async function handleMarketplaceTermsManagementRequest(request: Request): Promise<Response> {
    try {
        if (request.method === "OPTIONS") {
            return optionsResponse();
        }
        const route = routePath(request);
        if (route === "/marketplace-terms") {
            return await withMethod(request, "GET", () => getMarketplaceTermsManagement(request));
        }
        if (route === "/marketplace-terms/publish") {
            return await withMethod(request, "POST", () => publishMarketplaceTermsManagement(request));
        }
        if (route === "/seller-capabilities") {
            return await withMethod(request, "POST", () => listSellerHeldPaymentCapabilities(request));
        }
        return json({ error: "not found" }, 404);
    } catch (error) {
        return handleError(error);
    }
}

export function serveMarketplaceTermsManagement(): void {
    Deno.serve(handleMarketplaceTermsManagementRequest);
}

function routePath(request: Request): string {
    const pathname = new URL(request.url).pathname.replace(/\/+$/, "");
    const marker = "/cms-stripe-connect-management";
    const index = pathname.indexOf(marker);
    return index === -1 ? pathname || "/" : pathname.slice(index + marker.length) || "/";
}
