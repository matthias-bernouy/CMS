import { HttpError } from "../core/errors.ts";
import { isRecord, stringValue } from "../core/records.ts";
import { getOne } from "../core/rest.ts";
import type { JsonRecord } from "../core/types.ts";
import { insertRow, updateRow } from "./rows.ts";

export async function resolveExternalReference(body: JsonRecord, expectedEntityType: string): Promise<unknown> {
    const ref = externalReferenceBody(body);
    if (!ref) return undefined;
    if (ref.entity_type && ref.entity_type !== expectedEntityType) {
        throw new HttpError(400, "externalReference entityType does not match endpoint");
    }
    const existing = await getOne("external_references", {
        provider: ref.provider,
        entity_type: expectedEntityType,
        external_id: ref.external_id,
    }, "entity_id");
    return existing?.entity_id;
}

export async function attachExternalReference(body: JsonRecord, entityType: string, entityId: unknown): Promise<void> {
    const ref = externalReferenceBody(body);
    if (!ref) return;
    const row = {
        provider: ref.provider,
        entity_type: entityType,
        external_id: ref.external_id,
        entity_id: entityId,
        ...(ref.metadata ? { metadata: ref.metadata } : {}),
    };
    const existing = await getOne("external_references", {
        provider: ref.provider,
        entity_type: entityType,
        external_id: ref.external_id,
    }, "id");
    if (existing) await updateRow("external_references", existing.id, row);
    else await insertRow("external_references", row);
}

function externalReferenceBody(body: JsonRecord): JsonRecord | null {
    const value = body.externalReference ?? body.external_reference;
    if (!isRecord(value)) return null;
    const provider = stringValue(value.provider);
    const externalId = stringValue(value.externalId ?? value.external_id);
    if (!provider || !externalId) throw new HttpError(400, "externalReference requires provider and externalId");
    return {
        provider,
        external_id: externalId,
        entity_type: stringValue(value.entityType ?? value.entity_type),
        metadata: isRecord(value.metadata) ? value.metadata : undefined,
    };
}
