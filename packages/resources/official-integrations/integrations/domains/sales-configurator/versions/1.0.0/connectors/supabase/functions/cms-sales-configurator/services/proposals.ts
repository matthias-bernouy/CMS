import { restJson } from "../core/rest.ts";
import type { JsonRecord } from "../core/types.ts";

export async function hydrateProposalSummaries(
    proposals: JsonRecord[],
    includePartners = false,
): Promise<JsonRecord[]> {
    if (!proposals.length) {
        return [];
    }
    const proposalIds = numericValues(proposals, "id");
    const clientIds = numericValues(proposals, "client_id");
    const [clients, versions, partners] = await Promise.all([
        rowsByNumericIds("clients", "id", clientIds, "id,company_name,contact_name"),
        rowsByNumericIds(
            "proposal_versions",
            "proposal_id",
            proposalIds,
            "proposal_id,version_number,state,currency,fixed_total_cents,quote_item_count",
        ),
        includePartners ? partnerRows(proposals) : Promise.resolve([]),
    ]);
    const clientsById = new Map(clients.map((client) => [Number(client.id), client]));
    const partnersByUser = new Map(partners.map((partner) => [String(partner.cms_user_id), partner]));
    const versionsByProposal = groupByNumber(versions, "proposal_id");

    return proposals.map((proposal) => {
        const version = currentVersion(versionsByProposal.get(Number(proposal.id)) ?? []);
        const client = clientsById.get(Number(proposal.client_id));
        return {
            id: proposal.id,
            reference: proposal.reference,
            status: proposal.status,
            title: proposal.title,
            client,
            ...(includePartners
                ? {
                      partner_display_name:
                          partnersByUser.get(String(proposal.owner_cms_user_id))?.display_name ?? null,
                  }
                : {}),
            fixed_total_cents: version?.fixed_total_cents ?? 0,
            quote_item_count: version?.quote_item_count ?? 0,
            currency: version?.currency ?? "EUR",
            created_at: proposal.created_at,
            updated_at: proposal.updated_at,
        };
    });
}

export function currentVersion(versions: JsonRecord[]): JsonRecord | undefined {
    return (
        versions.find((version) => version.state === "draft") ??
        versions.find((version) => version.state === "published") ??
        versions[0]
    );
}

async function rowsByNumericIds(table: string, field: string, ids: number[], select: string): Promise<JsonRecord[]> {
    if (!ids.length) {
        return [];
    }
    return await restJson<JsonRecord[]>(`${table}?select=${select}&${field}=in.(${ids.join(",")})`);
}

async function partnerRows(proposals: JsonRecord[]): Promise<JsonRecord[]> {
    const ids = [...new Set(proposals.map((proposal) => String(proposal.owner_cms_user_id)).filter(Boolean))];
    if (!ids.length) {
        return [];
    }
    return await restJson<JsonRecord[]>(
        `partner_accounts?select=cms_user_id,display_name&cms_user_id=in.(${ids.map(quoted).join(",")})`,
    );
}

function quoted(value: string): string {
    return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function numericValues(rows: JsonRecord[], field: string): number[] {
    return [...new Set(rows.map((row) => Number(row[field])).filter(Number.isSafeInteger))];
}

function groupByNumber(rows: JsonRecord[], field: string): Map<number, JsonRecord[]> {
    const result = new Map<number, JsonRecord[]>();
    for (const row of rows) {
        const key = Number(row[field]);
        const values = result.get(key) ?? [];
        values.push(row);
        result.set(key, values);
    }
    return result;
}
