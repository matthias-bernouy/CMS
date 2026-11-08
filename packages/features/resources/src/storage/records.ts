import { createHash } from "node:crypto";
import { z } from "zod";
import { canonicalizeIJson, deepFreeze } from "@bernouy/ulvia-contracts/protocol";
import { assetSchema, localeSchema, textSourceSchema } from "resources/artifacts/archive/schemas";
import { validateResourceTextSource } from "resources/artifacts/validation/texts";
import { ResourceArchiveError } from "resources/artifacts/archive/errors";

const resourceAssetMetadataSchema = assetSchema.omit({ entry: true });
const overridesSchema = z.record(
    z.string(),
    z.record(
        localeSchema,
        z.string().refine((value) => value.length <= 65536 && !/[{}]/u.test(value)),
    ),
);
const textRecordSchema = z.strictObject({
    protocol: z.literal("ulvia-resource-texts/v1"),
    source: textSourceSchema,
    overrides: overridesSchema,
    revision: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
});
export type ResourceAssetMetadata = z.output<typeof resourceAssetMetadataSchema>;
export type ResourceTextRecord = z.output<typeof textRecordSchema>;
export type ResourceAssetReference = Pick<ResourceAssetMetadata, "namespace" | "id">;

export function resourceDigest(value: unknown): `sha256:${string}` {
    return `sha256:${createHash("sha256").update(canonicalizeIJson(value)).digest("hex")}`;
}
export function resourceEntityId(scopeId: string, kind: "asset" | "texts", namespace: string, id = ""): string {
    return resourceDigest([scopeId, kind, namespace, id]).slice(7);
}
export function assertResourceScope(scopeId: string): void {
    if (typeof scopeId !== "string" || !scopeId || scopeId.length > 256 || /[\p{Cc}\p{Cs}]/u.test(scopeId)) {
        throw new TypeError("Resource metadata requires an explicit bounded scope");
    }
}
export function readAssetMetadata(value: unknown): ResourceAssetMetadata {
    const asset = resourceAssetMetadataSchema.parse(value);
    if (asset.profiles?.includes("inline-svg") && asset.mediaType !== "image/svg+xml") {
        throw new ResourceArchiveError("Inline SVG assets require image/svg+xml");
    }
    return deepFreeze(asset);
}

/** Ordinary text defaults and site overrides; no archive coordinate is persisted. */
export function createTextRecord(source: unknown, overrides: unknown = {}): ResourceTextRecord {
    const base = {
        protocol: "ulvia-resource-texts/v1",
        source: textSourceSchema.parse(source),
        overrides: overridesSchema.parse(overrides),
    };
    validateResourceTextSource(base.source);
    return readTextRecord({ ...base, revision: resourceDigest(base) });
}
export function readTextRecord(value: unknown): ResourceTextRecord {
    const record = textRecordSchema.parse(value);
    const { revision, ...body } = record;
    if (Buffer.byteLength(canonicalizeIJson(record)) > 512 * 1024 || revision !== resourceDigest(body)) {
        throw new ResourceArchiveError("Text record exceeds its limit or has an invalid revision");
    }
    const ids = new Set(record.source.texts.map((text) => text.id));
    validateResourceTextSource(record.source);
    for (const [id, locales] of Object.entries(record.overrides)) {
        if (!ids.has(id) || Object.keys(locales).length > 32) {
            throw new ResourceArchiveError("Text overrides require a declared identity and bounded locales");
        }
    }
    return deepFreeze(record);
}
export function assetReferences(input: readonly ResourceAssetReference[]): readonly ResourceAssetReference[] {
    const refs = z
        .array(resourceAssetMetadataSchema.pick({ namespace: true, id: true }))
        .max(512)
        .parse(input);
    return [...new Map(refs.map((ref) => [JSON.stringify([ref.namespace, ref.id]), Object.freeze(ref)])).values()];
}
export class ResourceConflictError extends Error {
    readonly status = 409;
}
