import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { join } from "node:path";
import { isResourceId, parseStrictJson } from "@bernouy/ulvia-contracts/protocol";
import type { PreparationInventoryPage } from "repository/application/authoring/interfaces/AuthoringDtos";
import { MAX_PREPARATION_RECORD_BYTES } from "../record";

type Item = PreparationInventoryPage["items"][number];

/** Inspect only the selected page, one bounded record at a time; never read source trees or assets. */
export async function preparationMetadata(root: string, id: string, expiresAt: number): Promise<Item> {
    const fallback: Item = {
        preparationId: id,
        kind: null,
        resourceId: null,
        version: null,
        expiresAt: new Date(expiresAt).toISOString(),
        publicationState: "unreadable",
    };
    try {
        const path = join(root, id);
        const record = await readJson(join(path, "prepared.json"), MAX_PREPARATION_RECORD_BYTES);
        const collection = record.schema === "ulvia.collection-preparation.v1";
        if (!collection && record.schema !== "ulvia.artifact-preparation.v1") {
            return fallback;
        }
        if ((collection ? record.id : record.preparationId) !== id || typeof record.canonicalJson !== "string") {
            return fallback;
        }
        const canonicalValue = collection
            ? parseStrictJson(record.canonicalJson, MAX_PREPARATION_RECORD_BYTES, 64)
            : record;
        if (!canonicalValue || typeof canonicalValue !== "object" || Array.isArray(canonicalValue)) {
            return fallback;
        }
        const canonical = canonicalValue as Record<string, unknown>;
        const kind = collection ? "collection" : record.kind;
        if (kind !== "collection" && kind !== "contract" && kind !== "provider-manifest" && kind !== "workflow") {
            return fallback;
        }
        const resourceId = collection ? canonical.collectionId : record.id;
        const version = canonical.version;
        if (
            !isResourceId(resourceId) ||
            typeof version !== "string" ||
            version.length < 1 ||
            version.length > 64 ||
            !Number.isSafeInteger(record.expiresAt) ||
            typeof record.expiresAt !== "number" ||
            record.expiresAt < 0
        ) {
            return fallback;
        }
        const receipt = await readJson(join(path, "publication.json"), 4096).catch((error: NodeJS.ErrnoException) => {
            if (error.code === "ENOENT") {
                return null;
            }
            throw error;
        });
        if (
            receipt &&
            (receipt.digest !== record.digest ||
                typeof receipt.sourcesStored !== "boolean" ||
                receipt.schema !== (collection ? "ulvia.collection-publication.v1" : "ulvia.artifact-publication.v1") ||
                (!collection && receipt.kind !== kind))
        ) {
            return fallback;
        }
        return {
            preparationId: id,
            kind,
            resourceId,
            version,
            expiresAt: new Date(record.expiresAt).toISOString(),
            publicationState: receipt ? (receipt.sourcesStored ? "published" : "sources-pending") : "not-recorded",
        };
    } catch (error) {
        if (["EACCES", "EPERM", "EIO", "EMFILE", "ENFILE"].includes((error as NodeJS.ErrnoException).code ?? "")) {
            throw error;
        }
        return fallback;
    }
}

async function readJson(path: string, maxBytes: number): Promise<Record<string, unknown>> {
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
        const info = await handle.stat();
        if (!info.isFile() || info.size > maxBytes) {
            throw new Error("Invalid preparation metadata");
        }
        const value = parseStrictJson(await handle.readFile(), maxBytes, 16);
        if (!value || typeof value !== "object" || Array.isArray(value)) {
            throw new Error("Invalid preparation metadata");
        }
        return value as Record<string, unknown>;
    } finally {
        await handle.close();
    }
}
