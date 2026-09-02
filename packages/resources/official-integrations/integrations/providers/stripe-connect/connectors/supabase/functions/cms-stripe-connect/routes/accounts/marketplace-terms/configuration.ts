import { requireCmsRequest } from "../../../http/auth.ts";
import { assertAllowedKeys, readJsonObject } from "../../../http/body/index.ts";
import { HttpError } from "../../../http/errors.ts";
import { json } from "../../../http/responses.ts";
import { isRecord } from "../../../shared/data.ts";
import type { JsonRecord } from "../../../shared/types.ts";
import { serializePublishedPage, sha256Hex } from "./canonical-page.ts";
import { syncMarketplaceTermsConfiguration } from "./repository.ts";
import { materializePublishedMarketplaceTerms } from "./snapshot.ts";

const maximumConfigurationBytes = 8_388_608;

export async function configureMarketplaceTerms(request: Request): Promise<Response> {
    requireCmsRequest(request, { requireUser: false });
    const declaredLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > maximumConfigurationBytes) {
        throw new HttpError(400, "marketplace terms configuration must not exceed 8 MiB");
    }
    const body = await readJsonObject(request);
    assertAllowedKeys(body, ["documents", "legacyVersion", "legacyHash"]);
    if (new TextEncoder().encode(JSON.stringify(body)).byteLength > maximumConfigurationBytes) {
        throw new HttpError(400, "marketplace terms configuration must not exceed 8 MiB");
    }
    const documents = body.documents;
    if (!Array.isArray(documents) || documents.length > 1) {
        throw new HttpError(400, "documents must be an array containing at most one seller terms document");
    }
    const document = documents.length ? await publishedDocument(documents[0]) : null;
    return json(
        await syncMarketplaceTermsConfiguration({
            document,
            legacyVersion: document ? null : optionalText(body.legacyVersion, 200),
            legacyHash: document ? null : optionalHash(body.legacyHash),
            actorId: "cms-integration-sync",
        }),
    );
}

async function publishedDocument(value: unknown): Promise<JsonRecord> {
    if (!isRecord(value)) {
        throw new HttpError(400, "documents[0] must be an object");
    }
    assertOnlyKeys(value, ["key", "label", "consentText", "page"], "documents[0]");
    const documentKey = requiredText(value.key, "documents[0].key", 80);
    if (!/^[a-z][a-z0-9_.-]{1,79}$/.test(documentKey)) {
        throw new HttpError(422, "documents[0].key is invalid");
    }
    const label = requiredText(value.label, "documents[0].label", 200);
    const consentText = requiredText(value.consentText, "documents[0].consentText", 1_000);
    const snapshot = await materializePublishedMarketplaceTerms(value.page);
    const revisionHash = await sha256Hex(
        JSON.stringify({
            documentKey,
            label,
            consentText,
            page: JSON.parse(serializePublishedPage(snapshot.page)),
            contentHash: snapshot.contentHash,
        }),
    );
    return {
        documentKey,
        label,
        consentText,
        page: snapshot.page,
        publishedSnapshotUrl: snapshot.publishedSnapshotUrl,
        contentHash: snapshot.contentHash,
        revisionHash,
    };
}

function requiredText(value: unknown, name: string, maximum: number): string {
    if (typeof value !== "string") {
        throw new HttpError(400, `${name} is required`);
    }
    const normalized = value.trim();
    if (!normalized || normalized.length > maximum) {
        throw new HttpError(422, `${name} is invalid`);
    }
    return normalized;
}

function optionalText(value: unknown, maximum: number): string | null {
    if (value === undefined || value === null || value === "") {
        return null;
    }
    if (typeof value !== "string" || value.trim().length > maximum) {
        throw new HttpError(400, "legacyVersion is invalid");
    }
    return value.trim();
}

function optionalHash(value: unknown): string | null {
    const hash = optionalText(value, 64)?.toLowerCase() ?? null;
    if (hash && !/^[a-f0-9]{64}$/.test(hash)) {
        throw new HttpError(400, "legacyHash must be a SHA-256 hex digest");
    }
    return hash;
}

function assertOnlyKeys(value: JsonRecord, allowed: string[], name: string): void {
    const expected = new Set(allowed);
    const extra = Object.keys(value).find((key) => !expected.has(key));
    if (extra) {
        throw new HttpError(400, `${name}.${extra} is not allowed`);
    }
}
