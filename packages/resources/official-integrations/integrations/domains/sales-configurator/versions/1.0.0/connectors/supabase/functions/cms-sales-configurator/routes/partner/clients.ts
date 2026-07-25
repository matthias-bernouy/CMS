import { HttpError } from "../../core/errors.ts";
import { json } from "../../core/http.ts";
import { requirePartner } from "../../services/partner.ts";
import { addSearch, listQuery } from "../../services/query.ts";
import { camelize, integer, queryInteger, readJsonObject, requiredText, text } from "../../core/records.ts";
import { exactFilter, listRows, one, rpc } from "../../core/rest.ts";
import { rpcEntity } from "../../core/rpc-result.ts";

const clientSelect =
    "id,company_name,company_registration_number,contact_name,contact_job_title,contact_email,contact_phone,address_line1,address_line2,postal_code,city,country,notes,created_at,updated_at";

export async function listMyClients(request: Request): Promise<Response> {
    const partner = await requirePartner(request, "clients.manage");
    const query = listQuery(request);
    const params = new URLSearchParams({
        select: clientSelect,
        partner_account_id: exactFilter(partner.id),
        order: "id.desc",
        limit: String(query.limit),
        offset: String(query.offset),
    });
    addSearch(
        params,
        query.query,
        "company_name",
        "company_registration_number",
        "contact_name",
        "contact_email",
        "city",
    );
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
    const client = await one("clients", { id, partner_account_id: partner.id }, clientSelect);
    if (!client) {
        throw new HttpError(404, "client not found");
    }
    return json(camelize(client));
}

export async function saveMyClient(request: Request): Promise<Response> {
    const partner = await requirePartner(request, "clients.manage");
    const body = await readJsonObject(request);
    const result = await rpc("save_partner_client", {
        p_partner_account_id: partner.id,
        p_client_id: queryInteger(request, "id") ?? integer(body.id, "id") ?? null,
        p_payload: {
            company_name: requiredText(body.companyName, "companyName"),
            company_registration_number: text(body.companyRegistrationNumber) ?? null,
            contact_name: requiredText(body.contactName, "contactName"),
            contact_job_title: text(body.contactJobTitle) ?? null,
            contact_email: requiredText(body.contactEmail, "contactEmail"),
            contact_phone: text(body.contactPhone) ?? null,
            address_line1: text(body.addressLine1) ?? null,
            address_line2: text(body.addressLine2) ?? null,
            postal_code: text(body.postalCode) ?? null,
            city: text(body.city) ?? null,
            country: text(body.country) ?? null,
            notes: text(body.notes) ?? null,
        },
    });
    return json(rpcEntity(result, "client"));
}
