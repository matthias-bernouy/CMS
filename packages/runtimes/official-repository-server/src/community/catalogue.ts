import type { RepositoryReadEndpoint } from "@bernouy/cms-repository/repository/filesystem";
import type { RepositoryCapabilityPorts } from "@bernouy/cms-repository/repository/contract";
import type { RemoteCoordinate } from "@bernouy/cms-repository/repository/publication";

export function repositoryReleasePath(coordinate: RemoteCoordinate): string {
    const directory = catalogueType(coordinate.kind);
    return `/v1/${directory}/${[coordinate.publisherId, coordinate.id, coordinate.version].map(encodeURIComponent).join("/")}`;
}

export function cataloguePorts(
    reads: RepositoryReadEndpoint,
): Pick<RepositoryCapabilityPorts, "catalogue" | "release"> {
    return {
        async catalogue(input) {
            const url = new URL(`http://repository.local/v1/${catalogueType(input.kind)}`);
            url.searchParams.set("limit", String(input.limit));
            if (input.cursor) {
                url.searchParams.set("cursor", input.cursor);
            }
            const response = await reads.handle(new Request(url));
            if (!response?.ok) {
                throw new Error("Invalid catalogue request");
            }
            const value = (await response.json()) as { releases: Record<string, unknown>[]; nextCursor?: string };
            return {
                releases: value.releases.map((entry) => ({
                    kind: input.kind,
                    publisherId: entry.publisherId as string,
                    version: entry.version as string,
                    id: (entry.collectionId ?? entry.contractId ?? entry.providerId) as string,
                    digest: entry.digest as string,
                })),
                ...(value.nextCursor ? { nextCursor: value.nextCursor } : {}),
            };
        },
        async release(coordinate) {
            const response = await reads.handle(
                new Request(`http://repository.local${repositoryReleasePath(coordinate)}`),
            );
            if (!response?.ok || !response.body) {
                return null;
            }
            return {
                stream: response.body,
                contentType: "application/json",
                contentLength: Number(response.headers.get("content-length")),
                digest: response.headers.get("etag") ?? "",
            };
        },
    };
}

function catalogueType(kind: RemoteCoordinate["kind"]): string {
    return kind === "collection" ? "collections" : kind === "contract" ? "contracts" : "providers";
}
