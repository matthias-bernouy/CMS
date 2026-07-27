import { subjectClaimHash } from "../core/auth.ts";
import { HttpError } from "../core/errors.ts";
import { json } from "../core/http.ts";
import { acceptedVersionIds, attemptId, contextKey, readJsonObject, requiredText } from "../core/records.ts";
import { rpc } from "../core/rest.ts";

export async function stageAcceptance(request: Request): Promise<Response> {
    const body = await readJsonObject(request, 16_384);
    const context = contextKey(body.contextKey);
    const hasAttempt = typeof body.attemptId === "string" && Boolean(body.attemptId.trim());
    const hasSubjectClaim = typeof body.subjectClaim === "string" && Boolean(body.subjectClaim.trim());
    const hasAcceptedVersions =
        typeof body.acceptedVersionIds === "string" ||
        (Array.isArray(body.acceptedVersionIds) && body.acceptedVersionIds.length > 0);
    const result = await rpc<Record<string, unknown>>("stage_consent_acceptance", {
        p_context_key: context,
        p_attempt_id: hasAttempt ? attemptId(body.attemptId) : null,
        p_subject_claim_hash: hasSubjectClaim ? await subjectClaimHash(requiredText(body, "subjectClaim", 320)) : null,
        p_accepted_version_ids: hasAcceptedVersions ? acceptedVersionIds(body.acceptedVersionIds) : [],
    });
    if (result.state === "version_changed") {
        throw new HttpError(409, "CONSENT_DOCUMENT_VERSION_CHANGED");
    }
    return json(result);
}

export async function commitAcceptance(request: Request): Promise<Response> {
    const body = await readJsonObject(request, 16_384);
    const context = contextKey(body.contextKey);
    const cmsUserId = requiredText(body, "cmsUserId", 512);
    const hasAttempt = typeof body.attemptId === "string" && Boolean(body.attemptId.trim());
    const parsedAttempt = hasAttempt ? attemptId(body.attemptId) : null;
    const claimHash = hasAttempt ? await subjectClaimHash(requiredText(body, "subjectClaim", 320)) : null;
    const accepted = hasAttempt ? acceptedVersionIds(body.acceptedVersionIds) : [];
    const result = await rpc<Record<string, unknown>>("commit_consent_acceptance", {
        p_context_key: context,
        p_attempt_id: parsedAttempt,
        p_subject_claim_hash: claimHash,
        p_accepted_version_ids: accepted,
        p_cms_user_id: cmsUserId,
    });
    return json(result);
}
