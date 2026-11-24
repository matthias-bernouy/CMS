import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { sourceDigest, writeRecord } from "repository/repository/authoring/preparations/record";

export function preparationId(index: number): string {
    return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

export async function seedPreparation(root: string, index: number, kind = "collection", state = "not-recorded") {
    const id = preparationId(index);
    const path = join(root, id);
    await mkdir(path, { recursive: true });
    const canonicalJson = JSON.stringify({ kind, collectionId: "publisher/kit", version: "1.0.0" });
    const digest = sourceDigest(canonicalJson);
    await writeRecord(path, "prepared.json", {
        schema: kind === "collection" ? "ulvia.collection-preparation.v1" : "ulvia.artifact-preparation.v1",
        ...(kind === "collection" ? { id } : { preparationId: id, id: "publisher/kit", kind, version: "1.0.0" }),
        canonicalJson,
        digest,
        expiresAt: Date.now() + 86400_000,
        sourceJson: "private sources must never be returned",
    });
    if (state !== "not-recorded") {
        await writeRecord(path, "publication.json", {
            schema: kind === "collection" ? "ulvia.collection-publication.v1" : "ulvia.artifact-publication.v1",
            kind,
            digest,
            sourcesStored: state === "published",
        });
    }
    return { id, path };
}
