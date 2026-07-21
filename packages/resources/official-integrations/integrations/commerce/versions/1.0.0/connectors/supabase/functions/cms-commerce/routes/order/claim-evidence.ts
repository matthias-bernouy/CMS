import { cmsUserId } from "../../core/auth.ts";
import { HttpError } from "../../core/errors.ts";
import { corsHeaders, json } from "../../core/http.ts";
import { camelize, integer, isRecord, text } from "../../core/records.ts";
import { rpc } from "../../core/rest.ts";
import type { JsonRecord } from "../../core/types.ts";
import { deleteStorageImageBestEffort, downloadStorageImage, uploadStorageImage } from "../catalog/media-storage.ts";
import {
    claimEvidenceDownloadContext,
    claimEvidenceUploadContext,
    type ClaimEvidenceActorKind,
    type ClaimEvidenceScope,
} from "./read-model/evidence.ts";

const claimEvidenceBucket = "commerce-claim-evidence";
const maximumEvidenceBytes = 10 * 1024 * 1024;
const evidenceTypes = new Map([
    ["image/jpeg", "jpg"],
    ["image/png", "png"],
    ["image/webp", "webp"],
    ["application/pdf", "pdf"],
    ["video/mp4", "mp4"],
]);

export async function uploadMyClaimEvidence(request: Request, actorKind: ClaimEvidenceActorKind): Promise<Response> {
    const claimId = requiredQueryInteger(request, "claimId");
    const actorId = cmsUserId(request);
    const claim = await claimEvidenceUploadContext(claimId, actorKind, actorId);
    const { file, description } = await readEvidenceUpload(request);
    const extension = evidenceTypes.get(file.type.toLowerCase())!;
    const path = `claims/${claim.publicId}/${actorKind}/${crypto.randomUUID()}.${extension}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    assertFileSignature(file.type.toLowerCase(), bytes);
    const sha256 = await digest(bytes);
    await uploadStorageImage(claimEvidenceBucket, path, file);
    try {
        const value = await rpc("attach_marketplace_claim_evidence", {
            p_claim_id: claimId,
            p_submitted_by_kind: actorKind,
            p_submitted_by: actorId,
            p_storage_bucket: claimEvidenceBucket,
            p_storage_path: path,
            p_mime_type: file.type.toLowerCase(),
            p_file_size: file.size,
            p_original_filename: safeFileName(file.name),
            p_sha256: sha256,
            p_description: description,
            p_metadata: { upload: "edge_multipart_v1" },
        });
        if (!isRecord(value)) {
            throw new HttpError(502, "claim evidence persistence returned an invalid response");
        }
        return json(publicClaimEvidence(value), 201);
    } catch (error) {
        await deleteStorageImageBestEffort(claimEvidenceBucket, path);
        throw error;
    }
}

export async function getClaimEvidenceFile(request: Request, scope: ClaimEvidenceScope): Promise<Response> {
    const evidenceId = requiredQueryInteger(request, "evidenceId");
    const actorId = scope === "admin" ? null : (request.headers.get("x-cms-user-id") ?? "").trim() || null;
    const context = await claimEvidenceDownloadContext(evidenceId, scope, actorId);
    if (context.state === "identity_required") {
        cmsUserId(request);
        throw new HttpError(502, "claim evidence authorization returned an invalid response");
    }
    const evidence = context.evidence;
    if (evidence.storageBucket !== claimEvidenceBucket) {
        throw new HttpError(404, "claim evidence not found");
    }
    const stored = await downloadStorageImage(claimEvidenceBucket, evidence.storagePath);
    const headers = new Headers(corsHeaders);
    headers.set("content-type", evidence.mimeType ?? "application/octet-stream");
    headers.set("cache-control", "private, no-store");
    headers.set("x-content-type-options", "nosniff");
    headers.set(
        "content-disposition",
        `attachment; filename="claim-evidence-${evidenceId}.${evidenceExtension(String(evidence.mimeType))}"`,
    );
    return new Response(stored.body, { status: 200, headers });
}

export function publicClaimEvidence(value: JsonRecord): JsonRecord {
    return camelize({
        id: value.id,
        claim_id: value.claim_id ?? value.claimId,
        submitted_by_kind: value.submitted_by_kind ?? value.submittedByKind,
        mime_type: value.mime_type ?? value.mimeType,
        file_size: value.file_size ?? value.fileSize,
        original_filename: value.original_filename ?? value.originalFilename,
        sha256: value.sha256,
        description: value.description,
        metadata: value.metadata,
        created_at: value.created_at ?? value.createdAt,
    }) as JsonRecord;
}

async function readEvidenceUpload(request: Request): Promise<{ file: File; description: string | null }> {
    if (!(request.headers.get("content-type") ?? "").toLowerCase().includes("multipart/form-data")) {
        throw new HttpError(400, "claim evidence upload must use multipart/form-data");
    }
    let form: FormData;
    try {
        form = await request.formData();
    } catch {
        throw new HttpError(400, "invalid multipart body");
    }
    const file = form.get("file");
    if (!(file instanceof File)) {
        throw new HttpError(400, "file is required");
    }
    if (file.size <= 0) {
        throw new HttpError(400, "file is empty");
    }
    if (file.size > maximumEvidenceBytes) {
        throw new HttpError(413, "claim evidence file is too large");
    }
    if (!evidenceTypes.has(file.type.toLowerCase())) {
        throw new HttpError(400, "unsupported claim evidence file type");
    }
    const description = text(form.get("description"));
    if (description && description.length > 1000) {
        throw new HttpError(400, "description is too long");
    }
    return { file, description: description ?? null };
}

function assertFileSignature(mimeType: string, bytes: Uint8Array): void {
    const ascii = (start: number, end: number) => new TextDecoder().decode(bytes.slice(start, end));
    const matches =
        mimeType === "image/jpeg"
            ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
            : mimeType === "image/png"
              ? bytes.length >= 8 &&
                [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte)
              : mimeType === "image/webp"
                ? ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP"
                : mimeType === "application/pdf"
                  ? ascii(0, 5) === "%PDF-"
                  : mimeType === "video/mp4"
                    ? bytes.length >= 12 && ascii(4, 8) === "ftyp"
                    : false;
    if (!matches) {
        throw new HttpError(400, "claim evidence content does not match its declared file type");
    }
}

function requiredQueryInteger(request: Request, name: string): number {
    const value = integer(new URL(request.url).searchParams.get(name), name, true)!;
    if (value <= 0) {
        throw new HttpError(400, `${name} must be positive`);
    }
    return value;
}

function safeFileName(value: string): string {
    const safe = value
        .replace(/[\\/\u0000-\u001f\u007f]/g, "_")
        .trim()
        .slice(0, 255);
    return safe || "evidence";
}

function evidenceExtension(mimeType: string): string {
    return evidenceTypes.get(mimeType.toLowerCase()) ?? "bin";
}

async function digest(bytes: Uint8Array): Promise<string> {
    const buffer = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(buffer))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}
