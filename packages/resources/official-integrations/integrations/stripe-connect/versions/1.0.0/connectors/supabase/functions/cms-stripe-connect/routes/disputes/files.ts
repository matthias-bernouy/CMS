import { insertPaymentEvent } from "../../db/repositories/events-exceptions.ts";
import type { StripeDisputeRow } from "../../db/records/disputes.ts";
import { requireDashboardAdmin } from "../../http/auth.ts";
import { assertAllowedKeys, readJsonObject, requiredString } from "../../http/body.ts";
import { HttpError } from "../../http/errors.ts";
import { json } from "../../http/responses.ts";
import { uploadStripeDisputeEvidenceFile } from "../../provider/disputes.ts";

type DisputeFileRouteDependencies = {
    requiredDispute(disputeId: string): Promise<StripeDisputeRow>;
};

export function createUploadStripeDisputeFile({
    requiredDispute,
}: DisputeFileRouteDependencies): (request: Request) => Promise<Response> {
    return async function uploadStripeDisputeFile(request) {
        const { userId, actorKind } = requireDashboardAdmin(request);
        const body = await readJsonObject(request);
        assertAllowedKeys(body, ["disputeId", "fileName", "mimeType", "base64"]);
        const disputeId = requiredString(body, "disputeId", 200);
        const dispute = await requiredDispute(disputeId);
        const fileName = requiredString(body, "fileName", 200);
        const mimeType = requiredString(body, "mimeType", 100);
        if (!["image/jpeg", "image/png", "application/pdf"].includes(mimeType)) {
            throw new HttpError(400, "unsupported dispute evidence file type");
        }
        const bytes = decodeBase64(requiredString(body, "base64", 8_000_000));
        if (!bytes.length || bytes.length > 5 * 1024 * 1024) {
            throw new HttpError(413, "dispute evidence file is too large");
        }
        const form = new FormData();
        form.set("purpose", "dispute_evidence");
        const fileBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
        form.set("file", new Blob([fileBuffer], { type: mimeType }), fileName);
        const stripeFile = await uploadStripeDisputeEvidenceFile(form);
        await insertPaymentEvent(dispute.payment_id, "stripe_dispute_file_uploaded", actorKind, userId, {
            disputeId,
            stripeFileId: stripeFile.id,
            fileName,
        });
        return json(
            { fileId: stripeFile.id, fileName: stripeFile.filename ?? fileName, purpose: stripeFile.purpose },
            201,
        );
    };
}

function decodeBase64(value: string): Uint8Array {
    try {
        const binary = atob(value);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    } catch {
        throw new HttpError(400, "base64 evidence is invalid");
    }
}
