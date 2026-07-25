import { HttpError } from "../../core/errors.ts";
import { json, privateJson } from "../../core/http.ts";
import { requirePartner } from "../../services/partner.ts";
import {
    arrayValue,
    camelize,
    integer,
    isRecord,
    queryInteger,
    readJsonObject,
    requiredText,
    text,
} from "../../core/records.ts";
import { rpc } from "../../core/rest.ts";
import { rpcRecord } from "../../core/rpc-result.ts";
import { partnerProposalProjection } from "../../services/projection.ts";
import { createShareToken, shareTokenHash } from "../../services/token.ts";

export async function saveMyProposalDraft(request: Request): Promise<Response> {
    const partner = await requirePartner(request, "proposals.manage");
    const body = await readJsonObject(request);
    const selections = proposalSelections(body.selections);
    const customItems = customRequests(body.customRequests);
    const result = await rpc("save_partner_proposal_draft", {
        p_actor_cms_user_id: partner.cmsUserId,
        p_proposal_id: queryInteger(request, "id") ?? integer(body.id, "id") ?? null,
        p_client_id: integer(body.clientId, "clientId", true),
        p_proposal: {
            title: text(body.title) ?? null,
            introduction: text(body.introduction) ?? null,
            private_notes: text(body.privateNotes) ?? null,
        },
        p_selections: selections,
        p_custom_items: customItems,
    });
    const payload = camelize(result);
    if (isRecord(payload) && payload.state === "invalid") {
        return json(
            {
                error: "proposal prerequisites are incomplete",
                code: payload.code,
                missingRequirements: payload.missingRequirements ?? [],
            },
            422,
        );
    }
    const checked = rpcRecord(payload, "proposal");
    return json(requiredProposalProjection(checked));
}

export async function publishMyProposal(request: Request): Promise<Response> {
    const partner = await requirePartner(request, "proposals.publish");
    const body = await readJsonObject(request);
    const result = await rpc("publish_partner_proposal", {
        p_actor_cms_user_id: partner.cmsUserId,
        p_proposal_id: queryInteger(request, "id") ?? integer(body.proposalId, "proposalId", true),
        p_expected_version_id: integer(body.expectedVersionId, "expectedVersionId", true),
        p_expected_revision: integer(body.expectedRevision, "expectedRevision", true),
    });
    const payload = camelize(result);
    if (isRecord(payload) && payload.state === "conflict") {
        return json(
            {
                error:
                    payload.code === "draft_version_changed"
                        ? "proposal draft changed; reload before publishing"
                        : "proposal cannot be published",
                code: payload.code,
            },
            409,
        );
    }
    const checked = rpcRecord(payload, "proposal");
    return json(requiredProposalProjection(checked));
}

export async function createMyProposalShare(request: Request): Promise<Response> {
    const partner = await requirePartner(request, "proposals.share");
    const body = await readJsonObject(request);
    const expiresAt = optionalFutureTimestamp(body.expiresAt);
    const token = createShareToken();
    const result = await rpc("create_partner_proposal_share", {
        p_actor_cms_user_id: partner.cmsUserId,
        p_proposal_id: queryInteger(request, "id") ?? integer(body.proposalId, "proposalId", true),
        p_expires_at: expiresAt,
        p_token_hash: await shareTokenHash(token),
    });
    const payload = rpcRecord(result, "proposal share");
    const projection = requiredProposalProjection(payload);
    if (!isRecord(projection.share)) {
        throw new HttpError(502, "invalid proposal share response");
    }
    return privateJson({
        ...projection,
        token,
    });
}

export async function revokeMyProposalShare(request: Request): Promise<Response> {
    const partner = await requirePartner(request, "proposals.share");
    const body = await readJsonObject(request);
    const result = await rpc("revoke_partner_proposal_share", {
        p_actor_cms_user_id: partner.cmsUserId,
        p_proposal_id: queryInteger(request, "id") ?? integer(body.proposalId, "proposalId", true),
        p_share_id: queryInteger(request, "shareId") ?? integer(body.shareId, "shareId", true),
    });
    const payload = rpcRecord(result, "proposal share");
    const projection = requiredProposalProjection(payload);
    if (!isRecord(projection.share) || typeof projection.revoked !== "boolean") {
        throw new HttpError(502, "invalid proposal share response");
    }
    return json(projection);
}

function requiredProposalProjection(value: unknown): Record<string, unknown> {
    const projection = partnerProposalProjection(value);
    if (!projection) {
        throw new HttpError(502, "invalid proposal response");
    }
    return projection;
}

function optionalFutureTimestamp(value: unknown): string | null {
    if (value === undefined || value === null || value === "") {
        return null;
    }
    const raw = requiredText(value, "expiresAt");
    const parsed = new Date(raw);
    if (!Number.isFinite(parsed.valueOf()) || parsed.valueOf() <= Date.now()) {
        throw new HttpError(400, "expiresAt must be a future timestamp");
    }
    return parsed.toISOString();
}

function proposalSelections(value: unknown): Record<string, unknown>[] {
    return transportRecords(value, "selections", 100).map((entry, index) => {
        const optionalFeatureItemIds = arrayValue(
            entry.optionalFeatureItemIds ?? [],
            `selections[${index}].optionalFeatureItemIds`,
            300,
        ).map((item, featureIndex) =>
            integer(item, `selections[${index}].optionalFeatureItemIds[${featureIndex}]`, true),
        );
        return {
            variantItemId: integer(entry.variantItemId, `selections[${index}].variantItemId`, true),
            optionalFeatureItemIds: [...new Set(optionalFeatureItemIds)],
        };
    });
}

function customRequests(value: unknown): Record<string, unknown>[] {
    return transportRecords(value, "customRequests", 100).map((entry, index) => {
        return {
            label: requiredText(entry.label, `customRequests[${index}].label`),
            description: text(entry.description) ?? null,
            quantity: integer(entry.quantity ?? 1, `customRequests[${index}].quantity`, true),
        };
    });
}

function transportRecords(value: unknown, name: string, max: number): Record<string, unknown>[] {
    const raw = value === undefined || value === null || value === "" ? [] : Array.isArray(value) ? value : [value];
    const parsed = raw.flatMap((entry, index) => {
        if (isRecord(entry)) {
            return [entry];
        }
        if (typeof entry !== "string") {
            throw new HttpError(400, `${name}[${index}] must be an object or JSON object`);
        }
        let decoded: unknown;
        try {
            decoded = JSON.parse(entry);
        } catch {
            throw new HttpError(400, `${name}[${index}] must contain valid JSON`);
        }
        const values = Array.isArray(decoded) ? decoded : [decoded];
        if (values.some((item) => !isRecord(item))) {
            throw new HttpError(400, `${name}[${index}] must contain JSON objects`);
        }
        return values as Record<string, unknown>[];
    });
    if (parsed.length > max) {
        throw new HttpError(400, `${name} must contain at most ${max} entries`);
    }
    return parsed;
}
