import { HttpError } from "../../core/errors.ts";
import { camelize, integer } from "../../core/records.ts";
import { one, restJson } from "../../core/rest.ts";
import type { JsonRecord } from "../../core/types.ts";
import { currentVersion } from "../../services/proposals.ts";

const proposalSelect =
    "id,partner_account_id,client_id,reference,status,title,introduction,private_notes,created_at,updated_at";
const versionSelect =
    "id,proposal_id,version_number,revision,state,currency,fixed_total_cents,quote_item_count,public_title,public_introduction,client_company_name,client_company_registration_number,client_contact_name,client_contact_job_title,client_contact_email,client_contact_phone,client_address_line1,client_address_line2,client_postal_code,client_city,client_country,sales_contact_name,sales_contact_email,created_at,published_at";
const itemSelect =
    "id,proposal_version_id,parent_item_id,catalog_item_id,kind,origin,code,label,description,quantity,pricing_mode,unit_amount_cents,currency,sort_order";
const shareSelect = "id,proposal_version_id,expires_at,revoked_at,first_viewed_at,last_viewed_at,view_count,created_at";

export async function adminProposalById(id: number): Promise<JsonRecord> {
    const proposal = await one("proposals", { id }, proposalSelect);
    if (!proposal) {
        throw new HttpError(404, "proposal not found");
    }
    const [client, versions, events, partner] = await Promise.all([
        one("clients", { id: Number(proposal.client_id) }),
        restJson<JsonRecord[]>(
            `proposal_versions?select=${versionSelect}&proposal_id=eq.${id}&order=version_number.desc`,
        ),
        restJson<JsonRecord[]>(`proposal_events?select=*&proposal_id=eq.${id}&order=occurred_at.desc,id.desc`),
        one(
            "partner_accounts",
            { id: Number(proposal.partner_account_id) },
            "id,cms_user_id,status,display_name,contact_email,created_at,updated_at",
        ),
    ]);
    if (!client || !partner) {
        throw new HttpError(502, "proposal relationships are incomplete");
    }
    const versionIds = versions.map((version) => Number(version.id)).filter(Number.isSafeInteger);
    const [items, shares, capabilities] = await Promise.all([
        relatedRows("proposal_items", "proposal_version_id", versionIds, itemSelect, "sort_order.asc,id.asc"),
        relatedRows("proposal_shares", "proposal_version_id", versionIds, shareSelect, "created_at.desc,id.desc"),
        restJson<JsonRecord[]>(
            `partner_capabilities?select=capability&partner_account_id=eq.${partner.id}&order=capability.asc`,
        ),
    ]);
    const itemsByVersion = groupBy(items, "proposal_version_id");
    const hydratedVersions = versions.map((version) =>
        hydrateVersion(version, itemsByVersion.get(Number(version.id)) ?? []),
    );
    const current = currentVersion(hydratedVersions);
    if (!current) {
        throw new HttpError(502, "proposal has no version");
    }
    return camelize({
        ...proposal,
        client,
        partner: {
            ...partner,
            capabilities: capabilities.map((entry) => String(entry.capability)),
        },
        current_version: current,
        versions: hydratedVersions,
        shares,
        events,
    }) as JsonRecord;
}

function hydrateVersion(version: JsonRecord, items: JsonRecord[]): JsonRecord {
    const {
        public_title,
        public_introduction,
        client_company_name,
        client_company_registration_number,
        client_contact_name,
        client_contact_job_title,
        client_contact_email,
        client_contact_phone,
        client_address_line1,
        client_address_line2,
        client_postal_code,
        client_city,
        client_country,
        sales_contact_name,
        sales_contact_email,
        ...identity
    } = version;
    return {
        ...identity,
        title: public_title,
        introduction: public_introduction,
        client_snapshot: {
            company_name: client_company_name,
            company_registration_number: client_company_registration_number,
            contact_name: client_contact_name,
            contact_job_title: client_contact_job_title,
            contact_email: client_contact_email,
            contact_phone: client_contact_phone,
            address_line1: client_address_line1,
            address_line2: client_address_line2,
            postal_code: client_postal_code,
            city: client_city,
            country: client_country,
        },
        sales_contact: {
            display_name: sales_contact_name,
            email: sales_contact_email,
        },
        items,
    };
}

export function proposalIdFromRequest(request: Request): number {
    return integer(new URL(request.url).searchParams.get("id"), "id", true)!;
}

async function relatedRows(
    table: string,
    field: string,
    ids: number[],
    select: string,
    order: string,
): Promise<JsonRecord[]> {
    if (!ids.length) {
        return [];
    }
    return await restJson<JsonRecord[]>(`${table}?select=${select}&${field}=in.(${ids.join(",")})&order=${order}`);
}

function groupBy(rows: JsonRecord[], field: string): Map<number, JsonRecord[]> {
    const result = new Map<number, JsonRecord[]>();
    for (const row of rows) {
        const key = Number(row[field]);
        result.set(key, [...(result.get(key) ?? []), row]);
    }
    return result;
}
