import { HttpError } from "../core/errors.ts";
import { json } from "../core/http.ts";
import { contextKey, isRecord, readJsonObject } from "../core/records.ts";
import { rpc } from "../core/rest.ts";
import type { JsonRecord } from "../core/types.ts";
import { publishContext } from "./configuration.ts";

export async function manageConsent(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    const input = isRecord(body.input) ? body.input : {};
    if (body.operation === "health") {
        return health();
    }
    if (body.operation === "read-settings") {
        const values = await rpc<JsonRecord>("consent_context_management_projection", {
            p_context_key: contextKey(input.contextKey ?? "signup"),
        });
        return settingsResponse(values);
    }
    if (body.operation !== "save-settings") {
        throw new HttpError(400, "unsupported Consent management operation");
    }
    const documents = resolveDocuments(input.documents, body.resolvedPages, input.enabled === true);
    const response = await publishContext(
        new Request(request.url, {
            method: "POST",
            headers: request.headers,
            body: JSON.stringify({ ...input, documents }),
        }),
    );
    if (!response.ok) {
        return response;
    }
    const values: unknown = await response.json();
    if (!isRecord(values)) {
        throw new HttpError(502, "invalid Consent settings response");
    }
    return settingsResponse(values);
}

function resolveDocuments(documents: unknown, pages: unknown, required: boolean): unknown {
    if (!required) {
        return documents;
    }
    if (!Array.isArray(documents) || !isRecord(pages)) {
        throw new HttpError(422, "published CMS page references are required");
    }
    return documents.map((document, index) => {
        const page = pages[`documents.${index}.page`];
        if (
            !isRecord(document) ||
            !isRecord(page) ||
            document.page !== page.path ||
            typeof page.publishedSnapshotUrl !== "string"
        ) {
            throw new HttpError(422, "select a published CMS page for each consent document");
        }
        return { ...document, publishedSnapshotUrl: page.publishedSnapshotUrl };
    });
}

function settingsResponse(values: JsonRecord): Response {
    const revision = typeof values.revision === "string" ? values.revision : null;
    return json({ values, savedRevision: revision, appliedRevision: revision });
}

async function health(): Promise<Response> {
    const contexts = await rpc<JsonRecord>("list_consent_contexts", {});
    const items = Array.isArray(contexts.items) ? contexts.items.filter(isRecord) : [];
    const invalid = items.some((context) => context.enabled === true && Number(context.documentCount) === 0);
    const revisionInput = items
        .map((context) => `${String(context.contextKey)}:${String(context.revision)}`)
        .sort()
        .join("|");
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(revisionInput));
    const revision = [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    return json({
        schemaVersion: 1,
        status: invalid ? "blocked" : "ready",
        checkedAt: new Date().toISOString(),
        configuration: { savedRevision: revision, appliedRevision: revision },
        checks: [
            { id: "storage", status: "ok", code: "storage_available" },
            {
                id: "policies",
                status: invalid ? "error" : "ok",
                code: invalid ? "policy_documents_missing" : "policies_valid",
            },
        ],
    });
}
