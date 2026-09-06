import { HttpError } from "../core/errors.ts";
import { json } from "../core/http.ts";
import { acceptedVersionIds, contextKey, isRecord, readJsonObject, requiredText } from "../core/records.ts";
import { rpc } from "../core/rest.ts";

export async function recordOperationAcceptance(request: Request): Promise<Response> {
    const body = await readJsonObject(request, 16_384);
    const versions = body.acceptedVersionIds;
    if (!Array.isArray(versions)) {
        throw new HttpError(400, "acceptedVersionIds must be an array");
    }
    if (!isRecord(body.metadata) || JSON.stringify(body.metadata).length > 8192) {
        throw new HttpError(400, "metadata must be a bounded object");
    }
    const result = await rpc("record_operation_acceptance", {
        p_context_key: contextKey(body.contextKey),
        p_operation_key: requiredText(body, "operationKey", 512),
        p_cms_user_id: requiredText(body, "cmsUserId", 512),
        p_accepted_version_ids: versions.length ? acceptedVersionIds(versions) : [],
        p_metadata: body.metadata,
    });
    return json(result);
}

export async function getOperationAcceptance(request: Request): Promise<Response> {
    const body = await readJsonObject(request, 4096);
    const result = await rpc("operation_acceptance_projection", {
        p_context_key: contextKey(body.contextKey),
        p_operation_key: requiredText(body, "operationKey", 512),
        p_cms_user_id: requiredText(body, "cmsUserId", 512),
    });
    return json({ receipt: result });
}
