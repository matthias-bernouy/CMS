import { HttpError } from "../../../core/errors.ts";
import { json } from "../../../core/http.ts";
import { isPublishedSnapshotUrl, publishedPageContentHash, type PublishedPage } from "./published-page-snapshot.ts";
import { booleanValue, camelize, isRecord, readJsonObject, requiredText } from "../../../core/records.ts";
import { rpc } from "../../../core/rest.ts";
import type { JsonRecord } from "../../../core/types.ts";

export async function syncBuyerLegalDocuments(request: Request): Promise<Response> {
    const requestBody = await readJsonObject(request);
    const configuration = await parseConfiguration(requestBody);
    const result = await rpc("sync_buyer_legal_documents", {
        p_enabled: configuration.enabled,
        p_documents: configuration.documents,
        p_snapshot_origin: configuration.snapshotOrigin,
        p_actor_id: "cms-integration-sync",
    });
    return json(camelize(result));
}

async function parseConfiguration(
    body: JsonRecord,
): Promise<{ enabled: boolean; documents: JsonRecord[]; snapshotOrigin: string | null }> {
    let value: JsonRecord = body;
    if (body.configuration !== undefined) {
        if (typeof body.configuration !== "string" || body.configuration.length > 8_388_608) {
            throw new HttpError(400, "configuration must be a JSON string no larger than 8 MiB");
        }
        if (body.enabled !== undefined || body.documents !== undefined) {
            throw new HttpError(400, "configuration cannot be combined with enabled or documents");
        }
        try {
            const parsed: unknown = JSON.parse(body.configuration);
            if (!isRecord(parsed)) {
                throw new Error("not an object");
            }
            value = parsed;
        } catch {
            throw new HttpError(400, "configuration must contain a JSON object");
        }
    }
    const enabled = booleanValue(value.enabled, "enabled");
    if (enabled === undefined) {
        throw new HttpError(400, "enabled is required");
    }
    if (!Array.isArray(value.documents) || value.documents.length > 20) {
        throw new HttpError(400, "documents must be an array of at most 20 entries");
    }
    const documents = await Promise.all(value.documents.map(documentConfiguration));
    const contentBytes = documents.reduce((total, document) => {
        const page = document.page as JsonRecord;
        return total + new TextEncoder().encode(page.content as string).byteLength;
    }, 0);
    if (contentBytes > maximumAggregateContentBytes) {
        throw new HttpError(422, "legal document page content exceeds the aggregate 8 MiB limit");
    }
    const keys = documents.map((document) => document.key);
    if (new Set(keys).size !== keys.length) {
        throw new HttpError(400, "document keys must be unique");
    }
    if (enabled && !documents.length) {
        throw new HttpError(422, "enabled legal acceptance requires at least one document");
    }
    const origins = new Set(
        documents.map((document) => {
            const page = document.page as JsonRecord;
            return new URL(page.publishedSnapshotUrl as string).origin;
        }),
    );
    if (origins.size > 1) {
        throw new HttpError(422, "legal document pages must use the same CMS Delivery origin");
    }
    return { enabled, documents, snapshotOrigin: origins.values().next().value ?? null };
}

async function documentConfiguration(value: unknown, index: number): Promise<JsonRecord> {
    if (!isRecord(value)) {
        throw new HttpError(400, `documents[${index}] must be an object`);
    }
    const key = boundedText(value.key, `documents[${index}].key`, 80);
    if (!/^[a-z][a-z0-9_.-]{1,79}$/.test(key)) {
        throw new HttpError(422, `documents[${index}].key is invalid`);
    }
    const contexts = contextValues(value.contexts, index);
    if (!isRecord(value.page)) {
        throw new HttpError(422, `documents[${index}].page must be an object`);
    }
    const page = pageConfiguration(value.page, index);
    return {
        key,
        enabled: booleanValue(value.enabled, `documents[${index}].enabled`) ?? true,
        label: boundedText(value.label, `documents[${index}].label`, 200),
        consentText: boundedText(value.consentText, `documents[${index}].consentText`, 1000),
        contexts,
        page: {
            ...page,
            contentHash: await publishedPageContentHash(page),
            publishedSnapshotUrl: snapshotUrl(value.page.publishedSnapshotUrl, page.id, index),
        },
    };
}

function pageConfiguration(value: JsonRecord, index: number): PublishedPage {
    return {
        id: pageText(value.id, `documents[${index}].page.id`, 512),
        path: pagePath(value.path, index),
        title: pageText(value.title, `documents[${index}].page.title`, 500),
        description: pageText(value.description, `documents[${index}].page.description`, 1000, true),
        content: pageContent(value.content, index),
    };
}

function contextValues(value: unknown, index: number): string[] {
    if (!Array.isArray(value) || !value.length || value.length > supportedContexts.size) {
        throw new HttpError(422, `documents[${index}].contexts must be a non-empty array`);
    }
    const contexts = value.map((entry) => requiredText(entry, `documents[${index}].contexts[]`));
    if (new Set(contexts).size !== contexts.length || contexts.some((entry) => !supportedContexts.has(entry))) {
        throw new HttpError(422, `documents[${index}].contexts contains unsupported or duplicate values`);
    }
    return [...contexts].sort();
}

function boundedText(value: unknown, name: string, maximum: number): string {
    const result = requiredText(value, name);
    if (result.length > maximum) {
        throw new HttpError(422, `${name} is too long`);
    }
    return result;
}

function pagePath(value: unknown, index: number): string {
    const result = pageText(value, `documents[${index}].page.path`, 2048);
    if (!result.startsWith("/")) {
        throw new HttpError(422, `documents[${index}].page.path must start with /`);
    }
    return result;
}

function pageText(value: unknown, name: string, maximum: number, allowEmpty = false): string {
    if (typeof value !== "string" || value.length > maximum || (!allowEmpty && !value.trim())) {
        throw new HttpError(422, `${name} is invalid`);
    }
    return value;
}

function pageContent(value: unknown, index: number): string {
    if (typeof value !== "string" || !value.trim()) {
        throw new HttpError(422, `documents[${index}].page.content must be a non-empty string`);
    }
    if (new TextEncoder().encode(value).byteLength > 2_000_000) {
        throw new HttpError(422, `documents[${index}].page.content is too large`);
    }
    return value;
}

function snapshotUrl(value: unknown, pageId: string, index: number): string {
    if (typeof value !== "string" || value.length > 4_096 || !isPublishedSnapshotUrl(value, pageId)) {
        throw new HttpError(
            422,
            `documents[${index}].page.publishedSnapshotUrl is missing or is not a trusted CMS snapshot URL`,
        );
    }
    return value;
}

const supportedContexts = new Set([
    "buyer_checkout",
    "protected_payment",
    "direct_purchase",
    "negotiated_offer",
    "cart",
]);
const maximumAggregateContentBytes = 8_388_608;
