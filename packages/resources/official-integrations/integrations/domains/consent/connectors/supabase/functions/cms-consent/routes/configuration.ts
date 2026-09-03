import { HttpError } from "../core/errors.ts";
import { json } from "../core/http.ts";
import {
    fetchResolvedDocuments,
    hashResolvedDocuments,
    materializeResolvedDocuments,
} from "../core/publishedPages/index.ts";
import { contextKey, isRecord, readJsonObject } from "../core/records.ts";
import { rpc } from "../core/rest.ts";

export async function bootstrapContext(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    const result = await rpc<Record<string, unknown>>("bootstrap_consent_context", {
        p_context_key: contextKey(body.contextKey),
        p_actor_id: "cms-integration-bootstrap",
    });
    return json(result);
}

export async function listContexts(): Promise<Response> {
    return json(await rpc<Record<string, unknown>>("list_consent_contexts", {}));
}

export async function getContext(request: Request): Promise<Response> {
    const value = new URL(request.url).searchParams.get("context")?.trim() ?? "";
    if (!value) {
        return json({
            contextKey: "",
            enabled: false,
            status: "inactive",
            revision: "new",
            approvedSnapshotOrigin: null,
            updatedAt: null,
            documents: [],
        });
    }
    const result = await rpc<Record<string, unknown>>("consent_context_management_projection", {
        p_context_key: contextKey(value),
    });
    return json(result);
}

export async function publishContext(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    const context = contextKey(body.contextKey);
    const expectedRevision = revision(body.expectedRevision);
    const actorId = adminActor(request);
    if (body.enabled !== true) {
        const name = expectedRevision === "new" ? "publish_consent_context" : "disable_consent_context";
        const parameters =
            expectedRevision === "new"
                ? {
                      p_context_key: context,
                      p_enabled: false,
                      p_snapshot_origin: null,
                      p_documents: [],
                      p_actor_id: actorId,
                      p_expected_revision: expectedRevision,
                  }
                : {
                      p_context_key: context,
                      p_actor_id: actorId,
                      p_expected_revision: expectedRevision,
                  };
        return json(await rpc<Record<string, unknown>>(name, parameters));
    }
    const materialized = await fetchResolvedDocuments(body.documents);
    if (!materialized.documents.some((document) => document.enabled)) {
        throw new HttpError(422, "enabled consent requires at least one document");
    }
    const result = await rpc<Record<string, unknown>>("publish_consent_context", {
        p_context_key: context,
        p_enabled: true,
        p_snapshot_origin: materialized.snapshotOrigin,
        p_documents: materialized.documents,
        p_actor_id: actorId,
        p_expected_revision: expectedRevision,
    });
    return json(result);
}

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

function adminActor(request: Request): string {
    const value = request.headers.get("x-cms-user-id")?.trim() ?? "";
    if (!value || value.length > 512) {
        throw new HttpError(401, "CMS administrator identity is required");
    }
    return value;
}

function revision(value: unknown): string {
    if (typeof value !== "string" || !/^(new|[1-9][0-9]{0,19})$/.test(value)) {
        throw new HttpError(400, "expectedRevision is invalid");
    }
    return value;
}
