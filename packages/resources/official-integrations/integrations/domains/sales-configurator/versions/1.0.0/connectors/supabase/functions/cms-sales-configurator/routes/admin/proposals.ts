import { cmsUserId } from "../../core/auth.ts";
import { HttpError } from "../../core/errors.ts";
import { json } from "../../core/http.ts";
import { addSearch, listQuery } from "../../services/query.ts";
import { camelize, enumValue, integer, queryInteger, readJsonObject } from "../../core/records.ts";
import { listRows, restJson, rpc } from "../../core/rest.ts";
import { rpcRecord } from "../../core/rpc-result.ts";
import type { JsonRecord } from "../../core/types.ts";
import { hydrateProposalSummaries } from "../../services/proposals.ts";
import { adminProposalById, proposalIdFromRequest } from "./proposal-detail.ts";

const statuses = ["draft", "shared", "viewed", "accepted", "rejected", "expired", "archived"] as const;
const proposalSelect = "id,partner_account_id,client_id,reference,status,title,created_at,updated_at";

export async function listAdminProposals(request: Request): Promise<Response> {
    const query = listQuery(request);
    const url = new URL(request.url);
    const params = new URLSearchParams({
        select: proposalSelect,
        order: "updated_at.desc,id.desc",
        limit: String(query.limit),
        offset: String(query.offset),
    });
    if (query.status) {
        params.set("status", `eq.${query.status}`);
    }
    const [partnerAccountIds, clientIds] = await Promise.all([
        matchingPartnerAccountIds(url.searchParams.get("owner")),
        matchingClientIds(url.searchParams.get("client")),
    ]);
    if ((partnerAccountIds && !partnerAccountIds.length) || (clientIds && !clientIds.length)) {
        return json({ items: [], total: 0, limit: query.limit, offset: query.offset });
    }
    if (partnerAccountIds) {
        params.set("partner_account_id", `in.(${partnerAccountIds.join(",")})`);
    }
    if (clientIds) {
        params.set("client_id", `in.(${clientIds.join(",")})`);
    }
    addDateFilters(params, url.searchParams.get("from"), url.searchParams.get("to"));
    addSearch(params, query.query, "reference", "title", "introduction");
    const { rows, total } = await listRows(`proposals?${params}`);
    const items = await hydrateProposalSummaries(rows, true);
    return json({ items: camelize(items), total, limit: query.limit, offset: query.offset });
}

async function matchingPartnerAccountIds(value: string | null): Promise<number[] | undefined> {
    const query = safeFilterText(value);
    if (!query) {
        return undefined;
    }
    const params = new URLSearchParams({
        select: "id",
        or: `(cms_user_id.ilike.*${query}*,display_name.ilike.*${query}*)`,
        limit: "1000",
    });
    const rows = await restJson<JsonRecord[]>(`partner_accounts?${params}`);
    return rows.map((row) => Number(row.id)).filter(Number.isSafeInteger);
}

async function matchingClientIds(value: string | null): Promise<number[] | undefined> {
    const query = safeFilterText(value);
    if (!query) {
        return undefined;
    }
    const params = new URLSearchParams({
        select: "id",
        or: `(company_name.ilike.*${query}*,company_registration_number.ilike.*${query}*,contact_name.ilike.*${query}*,contact_email.ilike.*${query}*,city.ilike.*${query}*)`,
        limit: "1000",
    });
    const rows = await restJson<JsonRecord[]>(`clients?${params}`);
    return rows.map((row) => Number(row.id)).filter(Number.isSafeInteger);
}

function addDateFilters(params: URLSearchParams, from: string | null, to: string | null): void {
    if (from?.trim()) {
        params.append("updated_at", `gte.${dateBoundary(from, "from", false)}`);
    }
    if (to?.trim()) {
        params.append("updated_at", `lt.${dateBoundary(to, "to", true)}`);
    }
}

function dateBoundary(value: string, name: string, exclusiveEnd: boolean): string {
    const raw = value.trim();
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00.000Z`) : new Date(raw);
    if (!Number.isFinite(parsed.valueOf())) {
        throw new HttpError(400, `${name} must be an ISO date or timestamp`);
    }
    if (exclusiveEnd && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        parsed.setUTCDate(parsed.getUTCDate() + 1);
    } else if (exclusiveEnd) {
        parsed.setMilliseconds(parsed.getMilliseconds() + 1);
    }
    return parsed.toISOString();
}

function safeFilterText(value: string | null): string | undefined {
    return (
        value
            ?.trim()
            .replace(/[,*()[\]{}]/g, " ")
            .slice(0, 120) || undefined
    );
}

export async function getAdminProposal(request: Request): Promise<Response> {
    return json(await adminProposalById(proposalIdFromRequest(request)));
}

export async function transitionAdminProposal(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    const proposalId = queryInteger(request, "id") ?? integer(body.proposalId, "proposalId", true)!;
    rpcRecord(
        await rpc("transition_admin_proposal", {
            p_actor_cms_user_id: cmsUserId(request),
            p_proposal_id: proposalId,
            p_status: enumValue(body.status, "status", statuses, true),
        }),
        "proposal",
    );
    return json(await adminProposalById(proposalId));
}
