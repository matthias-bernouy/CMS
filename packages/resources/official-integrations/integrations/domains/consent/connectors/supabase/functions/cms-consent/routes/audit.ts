import { HttpError } from "../core/errors.ts";
import { json } from "../core/http.ts";
import { boundedLimit, contextKey, optionalText } from "../core/records.ts";
import { rpc } from "../core/rest.ts";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function listAcceptances(request: Request): Promise<Response> {
    const params = new URL(request.url).searchParams;
    const contextValue = optionalText(params.get("context"), 80);
    const cmsUserId = optionalText(params.get("cmsUserId"), 512);
    const beforeCommittedAt = optionalText(params.get("beforeCommittedAt"), 64);
    const beforeId = optionalText(params.get("beforeId"), 36);
    if ((beforeCommittedAt === null) !== (beforeId === null)) {
        throw new HttpError(400, "both audit cursor fields are required");
    }
    if (beforeCommittedAt && !Number.isFinite(Date.parse(beforeCommittedAt))) {
        throw new HttpError(400, "beforeCommittedAt is invalid");
    }
    if (beforeId && !uuidPattern.test(beforeId)) {
        throw new HttpError(400, "beforeId is invalid");
    }
    const result = await rpc<Record<string, unknown>>("list_consent_acceptances", {
        p_context_key: contextValue ? contextKey(contextValue) : null,
        p_cms_user_id: cmsUserId,
        p_before_committed_at: beforeCommittedAt,
        p_before_id: beforeId,
        p_limit: boundedLimit(params.get("limit")),
    });
    return json(result);
}
