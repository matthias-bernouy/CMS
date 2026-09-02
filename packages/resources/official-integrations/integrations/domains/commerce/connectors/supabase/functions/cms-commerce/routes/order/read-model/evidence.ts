import { HttpError } from "../../../core/errors.ts";
import { isRecord } from "../../../core/records.ts";
import { rpc } from "../../../core/rest.ts";

export type ClaimEvidenceActorKind = "buyer" | "seller";
export type ClaimEvidenceScope = ClaimEvidenceActorKind | "admin";

type DownloadContext =
    | { state: "identity_required" }
    | {
          state: "ok";
          evidence: {
              storageBucket: string;
              storagePath: string;
              mimeType: string | null;
          };
      };

const uploadFunction = "get_claim_evidence_upload_context";
const downloadFunction = "get_claim_evidence_download_context";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function claimEvidenceUploadContext(
    claimId: number,
    actorKind: ClaimEvidenceActorKind,
    actorId: string,
): Promise<{ publicId: string }> {
    const value = await rpc(uploadFunction, {
        p_claim_id: claimId,
        p_actor_kind: actorKind,
        p_actor_id: actorId,
    });
    if (!isRecord(value) || typeof value.state !== "string") {
        throw invalid(uploadFunction);
    }
    if (value.state === "not_found") {
        throw new HttpError(404, "claim not found");
    }
    if (value.state !== "ok" || typeof value.public_id !== "string" || !uuidPattern.test(value.public_id)) {
        throw invalid(uploadFunction);
    }
    return { publicId: value.public_id };
}

export async function claimEvidenceDownloadContext(
    evidenceId: number,
    scope: ClaimEvidenceScope,
    actorId: string | null,
): Promise<DownloadContext> {
    const value = await rpc(downloadFunction, {
        p_evidence_id: evidenceId,
        p_scope: scope,
        p_actor_id: actorId,
    });
    if (!isRecord(value) || typeof value.state !== "string") {
        throw invalid(downloadFunction);
    }
    if (value.state === "evidence_not_found") {
        throw new HttpError(404, "claim evidence not found");
    }
    if (value.state === "claim_not_found") {
        throw new HttpError(404, "claim not found");
    }
    if (value.state === "identity_required") {
        if (scope === "admin" || actorId !== null) {
            throw invalid(downloadFunction);
        }
        return { state: "identity_required" };
    }
    if (value.state !== "ok" || !isRecord(value.evidence)) {
        throw invalid(downloadFunction);
    }
    const evidence = value.evidence;
    if (
        typeof evidence.storage_bucket !== "string" ||
        typeof evidence.storage_path !== "string" ||
        !isSafeStoragePath(evidence.storage_path) ||
        !(typeof evidence.mime_type === "string" || evidence.mime_type === null)
    ) {
        throw invalid(downloadFunction);
    }
    if (scope !== "admin" && actorId === null) {
        return { state: "identity_required" };
    }
    return {
        state: "ok",
        evidence: {
            storageBucket: evidence.storage_bucket,
            storagePath: evidence.storage_path,
            mimeType: evidence.mime_type,
        },
    };
}

function invalid(functionName: string): HttpError {
    return new HttpError(502, `${functionName} returned an invalid response`);
}

function isSafeStoragePath(path: string): boolean {
    const segments = path.split("/");
    return (
        segments[0] === "claims" &&
        segments.length > 1 &&
        segments.every((segment) => segment !== "" && segment !== "." && segment !== "..")
    );
}
