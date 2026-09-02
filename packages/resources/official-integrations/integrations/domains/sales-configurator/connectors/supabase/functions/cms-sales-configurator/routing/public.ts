import { methodNotAllowed } from "../core/http.ts";
import { getSharedProposal } from "../routes/shared.ts";

export async function handlePublicRoute(route: string, request: Request): Promise<Response | null> {
    if (route !== "/shared-proposal") {
        return null;
    }
    return request.method === "GET" ? await getSharedProposal(request) : methodNotAllowed("GET");
}
