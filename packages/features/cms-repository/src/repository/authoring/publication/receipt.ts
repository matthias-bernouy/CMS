import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { parseStrictJson } from "cms-repository/exports/contracts/protocol";
import { RepositoryRequestError } from "../../core/errors";
import type { RepositoryNamespaceCredential } from "../../publication/transport/credentials";

export interface PublicationReceipt {
    readonly schema: "ulvia.collection-publication.v1";
    readonly digest: string;
    readonly origin: string;
    readonly repositoryId: string;
    readonly namespace: string;
    readonly added: boolean;
    readonly sourcesStored: boolean;
}
export async function readReceipt(
    path: string,
    digest: string,
    credential: RepositoryNamespaceCredential,
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
        value.schema !== "ulvia.collection-publication.v1" ||
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
