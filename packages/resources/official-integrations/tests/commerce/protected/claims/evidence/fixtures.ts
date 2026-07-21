import { jsonResponse, setRestResponder } from "../../../harness";
import { activeClaimRow, attachedEvidence, evidenceContents, evidenceRow, sellerRow } from "./raw";

type Row = Record<string, unknown>;
type Failure = { resource: string; message: string; status?: number };
type Options = {
    claim?: Row | null;
    seller?: Row | null;
    evidence?: Row | null;
    attached?: unknown;
    failure?: Failure;
    storage?: {
        body?: BodyInit | null;
        deleteStatus?: number;
        downloadStatus?: number;
        message?: string;
        uploadStatus?: number;
    };
};

const uploadContext = "get_claim_evidence_upload_context";
const downloadContext = "get_claim_evidence_download_context";
const resolvedStatuses = new Set(["resolved_buyer", "resolved_seller", "resolved_split"]);

export function useEvidenceResponder(options: Options = {}): void {
    const rows = resolvedRows(options);
    setRestResponder(async (request) => {
        const url = new URL(request.url);
        const resource = url.pathname.split("/").at(-1)!;
        if (url.pathname.includes("/storage/v1/object/")) {
            return storageResponse(request.method, options);
        }
        if (resource === uploadContext || resource === downloadContext) {
            if (isDatabaseFailure(options.failure)) {
                return failureResponse(options.failure!);
            }
            const body = (await request.json()) as Row;
            return jsonResponse(resource === uploadContext ? uploadEnvelope(rows, body) : downloadEnvelope(rows, body));
        }
        if (options.failure?.resource === resource) {
            return failureResponse(options.failure);
        }
        if (resource === "marketplace_claims") {
            return jsonResponse(
                rows.claim
                    ? [project(rows.claim, ["id", "public_id", "buyer_cms_user_id", "seller_id", "status"])]
                    : [],
            );
        }
        if (resource === "sellers") {
            return jsonResponse(rows.seller ? [project(rows.seller, ["cms_user_id"])] : []);
        }
        if (resource === "marketplace_claim_evidence") {
            return jsonResponse(rows.evidence ? [projectEvidence(rows.evidence)] : []);
        }
        if (resource === "attach_marketplace_claim_evidence") {
            const body = (await request.json()) as Row;
            return jsonResponse(options.attached === undefined ? attachedResponse(body) : options.attached);
        }
        throw new Error(`unexpected evidence request ${request.method} ${request.url}`);
    });
}

function resolvedRows(options: Options) {
    return {
        claim: options.claim === undefined ? activeClaimRow : options.claim,
        seller: options.seller === undefined ? sellerRow : options.seller,
        evidence: options.evidence === undefined ? evidenceRow : options.evidence,
    };
}

function uploadEnvelope(rows: ReturnType<typeof resolvedRows>, body: Row): Row {
    const claim = rows.claim;
    const actorKind = body.p_actor_kind;
    const actorId = body.p_actor_id;
    if (!claim || resolvedStatuses.has(String(claim.status))) {
        return { state: "not_found" };
    }
    const allowed =
        actorKind === "buyer"
            ? claim.buyer_cms_user_id === actorId
            : actorKind === "seller" && rows.seller?.cms_user_id === actorId;
    return allowed ? { state: "ok", public_id: claim.public_id, future_private_claim: true } : { state: "not_found" };
}

function downloadEnvelope(rows: ReturnType<typeof resolvedRows>, body: Row): Row {
    const evidence = rows.evidence;
    if (
        !evidence ||
        evidence.storage_bucket !== "commerce-claim-evidence" ||
        typeof evidence.storage_path !== "string"
    ) {
        return { state: "evidence_not_found" };
    }
    if (body.p_scope === "admin") {
        return okDownload(evidence);
    }
    if (body.p_actor_id === null) {
        return { state: "identity_required" };
    }
    const claim = rows.claim;
    if (!claim || resolvedStatuses.has(String(claim.status))) {
        return { state: "claim_not_found" };
    }
    const allowed =
        body.p_scope === "buyer"
            ? claim.buyer_cms_user_id === body.p_actor_id
            : body.p_scope === "seller" && rows.seller?.cms_user_id === body.p_actor_id;
    return allowed ? okDownload(evidence) : { state: "claim_not_found" };
}

function okDownload(evidence: Row): Row {
    return {
        state: "ok",
        evidence: { ...projectEvidence(evidence), future_private_evidence: true },
    };
}

function projectEvidence(row: Row): Row {
    return project(row, ["id", "claim_id", "storage_bucket", "storage_path", "mime_type"]);
}

function project(row: Row, fields: string[]): Row {
    return Object.fromEntries(fields.map((field) => [field, row[field]]));
}

function attachedResponse(body: Row): Row {
    return {
        ...attachedEvidence,
        claimId: body.p_claim_id,
        submittedByKind: body.p_submitted_by_kind,
        mimeType: body.p_mime_type,
        fileSize: body.p_file_size,
        originalFilename: body.p_original_filename,
        sha256: body.p_sha256,
        description: body.p_description,
        metadata: body.p_metadata,
    };
}

function storageResponse(method: string, options: Options): Response {
    const storage = options.storage ?? {};
    const status =
        method === "GET"
            ? (storage.downloadStatus ?? 200)
            : method === "POST"
              ? (storage.uploadStatus ?? 200)
              : (storage.deleteStatus ?? 200);
    if (status >= 400) {
        return jsonResponse({ message: storage.message ?? "storage unavailable" }, status);
    }
    return new Response(method === "GET" ? (storage.body ?? evidenceContents) : null, { status });
}

function isDatabaseFailure(failure?: Failure): boolean {
    return (
        failure !== undefined &&
        ["marketplace_claims", "sellers", "marketplace_claim_evidence"].includes(failure.resource)
    );
}

function failureResponse(failure: Failure): Response {
    return jsonResponse({ message: failure.message }, failure.status ?? 503);
}
