import { HttpError } from "../../core/errors.ts";
import { json } from "../../core/http.ts";
import { camelize, integer, isRecord } from "../../core/records.ts";
import { exactFilter, restJson, rpc } from "../../core/rest.ts";
import type { JsonRecord } from "../../core/types.ts";
import { requirePartner } from "../../services/partner.ts";
import { listQuery } from "../../services/query.ts";
import { hydrateProposalSummaries } from "../../services/proposals.ts";
import { partnerProposalProjection } from "../../services/projection.ts";

const proposalListSelect = "id,client_id,reference,status,title,created_at,updated_at";

export async function listMyProposals(request: Request): Promise<Response> {
    const partner = await requirePartner(request, "proposals.manage");
    const url = new URL(request.url);
    const query = listQuery(request);
    const limit = query.limit;
    const cursor = integer(url.searchParams.get("cursor"), "cursor");
    const params = new URLSearchParams({
        select: proposalListSelect,
        partner_account_id: exactFilter(partner.id),
        order: "id.desc",
        limit: String(limit + 1),
    });
    if (query.status) {
        params.set("status", `eq.${query.status}`);
    }
    const clientIds = await matchingClientIds(partner.id, query.query);
    addProposalSearch(params, query.query, clientIds);
    if (cursor) {
        params.set("id", `lt.${cursor}`);
    }
    const rows = await restJson<JsonRecord[]>(`proposals?${params}`);
    const hasMore = rows.length > limit;
    const items = await hydrateProposalSummaries(rows.slice(0, limit));
    return json({
        items: camelize(items),
        nextCursor: hasMore ? String(items.at(-1)?.id ?? "") : null,
    });
}

async function matchingClientIds(partnerAccountId: number, query: string | undefined): Promise<number[]> {
    if (!query) {
        return [];
    }
    const params = new URLSearchParams({
        select: "id",
        partner_account_id: exactFilter(partnerAccountId),
        or: `(company_name.ilike.*${query}*,company_registration_number.ilike.*${query}*,contact_name.ilike.*${query}*,contact_email.ilike.*${query}*,city.ilike.*${query}*)`,
        limit: "1000",
    });
    const rows = await restJson<JsonRecord[]>(`clients?${params}`);
    return rows.map((row) => Number(row.id)).filter(Number.isSafeInteger);
}

function addProposalSearch(params: URLSearchParams, query: string | undefined, clientIds: number[]): void {
    if (!query) {
        return;
    }
    const filters = [
        `reference.ilike.*${query}*`,
        `title.ilike.*${query}*`,
        `introduction.ilike.*${query}*`,
        ...(clientIds.length ? [`client_id.in.(${clientIds.join(",")})`] : []),
    ];
    params.set("or", `(${filters.join(",")})`);
}

export async function getMyProposal(request: Request): Promise<Response> {
    const partner = await requirePartner(request, "proposals.manage");
    const id = integer(new URL(request.url).searchParams.get("id"), "id", true)!;
    const result = await rpc("read_partner_proposal", {
        p_partner_account_id: partner.id,
        p_proposal_id: id,
    });
    const payload = camelize(result);
    if (isRecord(payload) && payload.state === "not_found") {
        throw new HttpError(404, "proposal not found");
    }
    const projection = partnerProposalProjection(payload);
    if (projection) {
        return json(projection);
    }
    throw new HttpError(502, "invalid proposal response");
}
