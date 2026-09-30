import { LocalCollectionRepository } from "../repository/local";

/** Serve only releases explicitly stored in the persistent local repository. */
export function startLocalRepository(port: number, repository: LocalCollectionRepository) {
    const server = Bun.serve({
        hostname: "127.0.0.1",
        port,
        async fetch(request) {
            if (request.method !== "GET") {
                return new Response(null, { status: 405 });
            }
            const pathname = new URL(request.url).pathname;
            if (pathname === "/v1/collections") {
                const releases = (await repository.list()).map(({ release, digest }) => ({
                    publisherId: release.publisherId,
                    collectionId: release.collectionId,
                    version: release.version,
                    digest,
                    name: release.name,
                    description: release.description ?? "",
                    blocCount: release.blocs.length,
                    hasTheme: Boolean(release.theme),
                }));
                return Response.json({ releases }, { headers: { "Cache-Control": "no-store" } });
            }
            const parts = pathname.split("/");
            if (parts.length !== 6 || parts[1] !== "v1" || parts[2] !== "collections") {
                return new Response(null, { status: 404 });
            }
            let coordinate: string[];
            try {
                coordinate = parts.slice(3).map(decodeURIComponent);
            } catch {
                return new Response(null, { status: 404 });
            }
            const artifact = await repository.get(coordinate[0]!, coordinate[1]!, coordinate[2]!);
            if (!artifact) {
                return new Response(null, { status: 404 });
            }
            return new Response(artifact.canonicalJson, {
                headers: {
                    "Content-Type": "application/json; charset=utf-8",
                    ETag: `"${artifact.digest}"`,
                    "Cache-Control": "public, max-age=31536000, immutable",
                },
            });
        },
    });
    return { url: `http://127.0.0.1:${server.port}`, stop: () => server.stop(true) };
}
