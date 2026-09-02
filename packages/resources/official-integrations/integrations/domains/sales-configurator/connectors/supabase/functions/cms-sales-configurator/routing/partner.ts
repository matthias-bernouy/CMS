import { methodNotAllowed } from "../core/http.ts";
import { getPartnerCatalog } from "../routes/partner/catalog.ts";
import { getMyClient, listMyClients, saveMyClient } from "../routes/partner/clients.ts";
import { getMyProposal, listMyProposals } from "../routes/partner/proposal-read.ts";
import {
    createMyProposalShare,
    publishMyProposal,
    revokeMyProposalShare,
    saveMyProposalDraft,
} from "../routes/partner/proposal-write.ts";

export async function handlePartnerRoute(route: string, request: Request): Promise<Response | null> {
    if (route === "/partner/catalog") {
        return request.method === "GET" ? await getPartnerCatalog(request) : methodNotAllowed("GET");
    }
    if (route === "/partner/clients") {
        return request.method === "GET" ? await listMyClients(request) : methodNotAllowed("GET");
    }
    if (route === "/partner/client") {
        if (request.method === "GET") {
            return await getMyClient(request);
        }
        if (request.method === "POST") {
            return await saveMyClient(request);
        }
        return methodNotAllowed("GET", "POST");
    }
    if (route === "/partner/proposals") {
        return request.method === "GET" ? await listMyProposals(request) : methodNotAllowed("GET");
    }
    if (route === "/partner/proposal") {
        return request.method === "GET" ? await getMyProposal(request) : methodNotAllowed("GET");
    }
    if (route === "/partner/proposal/draft") {
        return request.method === "POST" ? await saveMyProposalDraft(request) : methodNotAllowed("POST");
    }
    if (route === "/partner/proposal/publish") {
        return request.method === "POST" ? await publishMyProposal(request) : methodNotAllowed("POST");
    }
    if (route === "/partner/proposal/share") {
        return request.method === "POST" ? await createMyProposalShare(request) : methodNotAllowed("POST");
    }
    if (route === "/partner/proposal/share/revoke") {
        return request.method === "POST" ? await revokeMyProposalShare(request) : methodNotAllowed("POST");
    }
    return null;
}
