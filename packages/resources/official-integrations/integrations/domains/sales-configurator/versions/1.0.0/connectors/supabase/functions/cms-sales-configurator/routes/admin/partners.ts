import { HttpError } from "../../core/errors.ts";
import { json } from "../../core/http.ts";
import { addSearch, listQuery } from "../../services/query.ts";
import {
    camelize,
    enumValue,
    integer,
    opaqueText,
    queryInteger,
    readJsonObject,
    requiredText,
    text,
} from "../../core/records.ts";
import { listRows, one, restJson, rpc } from "../../core/rest.ts";
import { rpcEntity, rpcRecord } from "../../core/rpc-result.ts";
import type { JsonRecord } from "../../core/types.ts";

const capabilities = ["clients.manage", "proposals.manage", "proposals.publish", "proposals.share"] as const;
const partnerSelect = "id,cms_user_id,status,display_name,contact_email,created_at,updated_at";

export async function listPartners(request: Request): Promise<Response> {
    const query = listQuery(request);
    const params = new URLSearchParams({
        select: partnerSelect,
        order: "updated_at.desc,id.desc",
        limit: String(query.limit),
        offset: String(query.offset),
    });
    if (query.status) {
        params.set("status", `eq.${query.status}`);
    }
    addSearch(params, query.query, "display_name", "contact_email", "cms_user_id");
    const { rows, total } = await listRows(`partner_accounts?${params}`);
    const capabilities = await capabilitiesFor(rows.map((row) => Number(row.id)));
    const items = rows.map((row) => ({
        ...row,
        capabilities: capabilities.get(Number(row.id)) ?? [],
    }));
    return json({ items: camelize(items), total, limit: query.limit, offset: query.offset });
}

export async function getPartner(request: Request): Promise<Response> {
    const idValue = new URL(request.url).searchParams.get("id");
    if (idValue === "__new__") {
        return json(newPartner());
    }
    const id = integer(idValue, "id", true)!;
    return json(await partnerById(id));
}

function newPartner(): JsonRecord {
    return {
        id: null,
        cmsUserId: "",
        status: "active",
        displayName: "",
        contactEmail: null,
        capabilities: [],
    };
}

async function partnerById(id: number): Promise<JsonRecord> {
    const partner = await one("partner_accounts", { id }, partnerSelect);
    if (!partner) {
        throw new HttpError(404, "partner not found");
    }
    const grants = await restJson<JsonRecord[]>(
        `partner_capabilities?select=capability,created_at&partner_account_id=eq.${id}&order=capability.asc`,
    );
    return {
        ...(camelize(partner) as JsonRecord),
        capabilities: grants.map((grant) => String(grant.capability)),
    };
}

export async function upsertPartner(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    const result = await rpc("upsert_partner_account", {
        p_partner_account_id: queryInteger(request, "id") ?? integer(body.id, "id") ?? null,
        p_cms_user_id: opaqueText(body.cmsUserId, "cmsUserId"),
        p_payload: {
            display_name: requiredText(body.displayName, "displayName"),
            contact_email: text(body.contactEmail) ?? null,
            status: enumValue(body.status, "status", ["active", "suspended"]) ?? "active",
        },
    });
    const id = integer(rpcEntity(result, "partner").id, "partner id", true)!;
    return json(await partnerById(id));
}

async function capabilitiesFor(ids: number[]): Promise<Map<number, string[]>> {
    if (!ids.length) {
        return new Map();
    }
    const rows = await restJson<JsonRecord[]>(
        `partner_capabilities?select=partner_account_id,capability&partner_account_id=in.(${ids.join(",")})&order=capability.asc`,
    );
    const result = new Map<number, string[]>();
    for (const row of rows) {
        const id = Number(row.partner_account_id);
        const capabilities = result.get(id) ?? [];
        capabilities.push(String(row.capability));
        result.set(id, capabilities);
    }
    return result;
}

export async function setPartnerCapability(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    const capability = enumValue(body.capability, "capability", capabilities, true)!;
    const enabled = canonicalBoolean(body.enabled, "enabled");
    rpcRecord(
        await rpc("set_partner_capability", {
            p_partner_account_id:
                queryInteger(request, "partnerId") ?? integer(body.partnerAccountId, "partnerAccountId", true),
            p_capability: capability,
            p_enabled: enabled,
        }),
        "partner capability",
    );
    const id = queryInteger(request, "partnerId") ?? integer(body.partnerAccountId, "partnerAccountId", true)!;
    return json(await partnerById(id));
}

function canonicalBoolean(value: unknown, name: string): boolean {
    if (value === true || value === "true") {
        return true;
    }
    if (value === false || value === "false") {
        return false;
    }
    throw new HttpError(400, `${name} must be a boolean`);
}
