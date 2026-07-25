import { HttpError } from "../../core/errors.ts";
import { json } from "../../core/http.ts";
import { requirePartner } from "../../services/partner.ts";
import { addSearch, listQuery } from "../../services/query.ts";
import { camelize, integer, queryInteger, readJsonObject, requiredText, text } from "../../core/records.ts";
import { exactFilter, listRows, one, rpc } from "../../core/rest.ts";
import { rpcEntity } from "../../core/rpc-result.ts";

const clientSelect = "id,company_name,contact_name,contact_email,contact_phone,notes,created_at,updated_at";

export async function listMyClients(request: Request): Promise<Response> {
    const partner = await requirePartner(request, "clients.manage");
    const query = listQuery(request);
    const params = new URLSearchParams({
        select: clientSelect,
        owner_cms_user_id: exactFilter(partner.cmsUserId),
        order: "id.desc",
        limit: String(query.limit),
        offset: String(query.offset),
    });
    addSearch(params, query.query, "company_name", "contact_name", "contact_email");
    const { rows, total } = await listRows(`clients?${params}`);
    return json({
        items: camelize(rows),
        total,
        limit: query.limit,
        offset: query.offset,
    });
}

export async function getMyClient(request: Request): Promise<Response> {
    const partner = await requirePartner(request, "clients.manage");
    const id = integer(new URL(request.url).searchParams.get("id"), "id", true)!;
    const client = await one("clients", { id, owner_cms_user_id: partner.cmsUserId }, clientSelect);
    if (!client) {
        throw new HttpError(404, "client not found");
    }
    return json(camelize(client));
}

export async function saveMyClient(request: Request): Promise<Response> {
    const partner = await requirePartner(request, "clients.manage");
    const body = await readJsonObject(request);
    const result = await rpc("save_partner_client", {
        p_actor_cms_user_id: partner.cmsUserId,
        p_client_id: queryInteger(request, "id") ?? integer(body.id, "id") ?? null,
        p_payload: {
            company_name: requiredText(body.companyName, "companyName"),
            contact_name: requiredText(body.contactName, "contactName"),
            contact_email: requiredText(body.contactEmail, "contactEmail"),
            contact_phone: text(body.contactPhone) ?? null,
            notes: text(body.notes) ?? null,
        },
    });
    return json(rpcEntity(result, "client"));
}
