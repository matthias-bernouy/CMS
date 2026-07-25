import { requireCmsAdmin } from "../core/auth.ts";
import { methodNotAllowed } from "../core/http.ts";
import {
    listAdminServiceWithdrawalRequests,
    listMyServiceWithdrawalRequests,
    reviewServiceWithdrawalRequest,
    submitMyServiceWithdrawalRequest,
} from "../routes/order/service-withdrawals.ts";

export async function handleMarketplaceServiceWithdrawalRoute(
    route: string,
    request: Request,
): Promise<Response | null> {
    if (route !== "/me/order/service-withdrawal-requests") {
        return null;
    }
    if (request.method === "GET") {
        return await listMyServiceWithdrawalRequests(request);
    }
    if (request.method === "POST") {
        return await submitMyServiceWithdrawalRequest(request);
    }
    return methodNotAllowed("GET", "POST");
}

export async function handleAdminServiceWithdrawalRoute(route: string, request: Request): Promise<Response | null> {
    if (route === "/admin/service-withdrawal-requests") {
        requireCmsAdmin(request);
        return request.method === "GET" ? await listAdminServiceWithdrawalRequests(request) : methodNotAllowed("GET");
    }
    if (route === "/admin/service-withdrawal-request/review") {
        requireCmsAdmin(request);
        return request.method === "POST" ? await reviewServiceWithdrawalRequest(request) : methodNotAllowed("POST");
    }
    return null;
}
