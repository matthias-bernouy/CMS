import { HttpError } from "../core/errors.ts";
import { json } from "../core/http.ts";
import { hashResolvedDocuments, materializeResolvedDocuments } from "../core/publishedPages.ts";
import { contextKey, isRecord, readJsonObject } from "../core/records.ts";
import { rpc } from "../core/rest.ts";

export async function syncContext(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    let configuration = body;
    if (body.configuration !== undefined) {
        if (typeof body.configuration !== "string" || body.configuration.length > 10_000_000) {
            throw new HttpError(400, "configuration must be a bounded JSON string");
        }
        let parsed: unknown;
        try {
            parsed = JSON.parse(body.configuration);
        } catch {
            throw new HttpError(400, "configuration must contain valid JSON");
        }
        if (!isRecord(parsed)) {
            throw new HttpError(400, "configuration must contain an object");
        }
        configuration = parsed;
    }
    if (typeof configuration.enabled !== "boolean") {
        throw new HttpError(400, "enabled must be a boolean");
    }
    const context = contextKey(configuration.contextKey);
    const materialized = materializeResolvedDocuments(configuration.documents);
    const documents = await hashResolvedDocuments(materialized.documents);
    if (configuration.enabled && !documents.some((document) => document.enabled)) {
        throw new HttpError(422, "enabled consent requires at least one document");
    }
    const result = await rpc<Record<string, unknown>>("sync_consent_context", {
        p_context_key: context,
        p_enabled: configuration.enabled,
        p_snapshot_origin: materialized.snapshotOrigin,
        p_documents: documents,
        p_actor_id: "cms-integration-sync",
    });
    return json(result);
}
