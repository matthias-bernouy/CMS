import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { parseStrictJson } from "@bernouy/ulvia-contracts/protocol";
import { RepositoryRequestError } from "../../core/errors";
import type { RepositoryNamespaceCredential } from "../../publication/transport/credentials";

interface ReceiptFields {
    readonly digest: string;
    readonly origin: string;
    readonly repositoryId: string;
    readonly namespace: string;
    readonly added: boolean;
    readonly sourcesStored: boolean;
}
export type PublicationReceipt = ReceiptFields &
    (
        | { readonly schema: "ulvia.collection-publication.v1" }
        | { readonly schema: "ulvia.artifact-publication.v1"; readonly kind: "contract" | "provider-manifest" }
    );
export async function readReceipt(
    path: string,
    digest: string,
    credential: RepositoryNamespaceCredential,
    kind: "collection" | "contract" | "provider-manifest" = "collection",
): Promise<PublicationReceipt | null> {
    const file = join(path, "publication.json");
    const info = await stat(file).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
            return null;
        }
        throw error;
    });
    if (!info) {
        return null;
    }
    if (info.size > 4096) {
        throw new RepositoryRequestError("REJECTED", "Invalid publication receipt");
    }
    const value = parseStrictJson(await readFile(file), 4096, 8) as unknown as PublicationReceipt;
    if (
        (kind === "collection"
            ? value.schema !== "ulvia.collection-publication.v1"
            : value.schema !== "ulvia.artifact-publication.v1" || value.kind !== kind) ||
        value.digest !== digest ||
        value.origin !== credential.origin ||
        value.repositoryId !== credential.repositoryId ||
        value.namespace !== credential.namespace ||
        typeof value.added !== "boolean" ||
        typeof value.sourcesStored !== "boolean"
    ) {
        throw new RepositoryRequestError("REJECTED", "Publication receipt belongs to different content or Repository");
    }
    return value;
}
