import type { RemoteCoordinate, RepositoryArtifactKind } from "./types";

export function parsePublicationUploadPath(path: string): { uploadId: string; assetId?: string } | null {
    const parts = path.split("/");
    if (parts.length === 4 && parts[1] === "v1" && parts[2] === "publication-uploads") {
        return validUploadId(parts[3]) ? { uploadId: parts[3]! } : null;
    }
    if (parts.length === 6 && parts[1] === "v1" && parts[2] === "publication-uploads" && parts[4] === "assets") {
        try {
            const assetId = decodeURIComponent(parts[5]!);
            return validUploadId(parts[3]) && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/u.test(assetId)
                ? { uploadId: parts[3]!, assetId }
                : null;
        } catch {
            return null;
        }
    }
    return null;
}

export function parseYankCoordinate(path: string): RemoteCoordinate {
    const parts = path.split("/");
    if (parts.length !== 7) {
        throw new Error("Invalid yank coordinate");
    }
    const [kind, publisherId, id, version] = parts.slice(3).map(decodeURIComponent);
    if (!isKind(kind)) {
        throw new Error("Invalid yank artifact kind");
    }
    return { kind, publisherId: publisherId!, id: id!, version: version! };
}

function validUploadId(value: string | undefined): value is string {
    return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value));
}

function isKind(value: string | undefined): value is RepositoryArtifactKind {
    return value === "collection" || value === "contract" || value === "provider-manifest";
}
