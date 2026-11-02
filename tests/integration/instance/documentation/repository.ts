import {
    FilesystemRepositoryNamespaceStore,
    FilesystemRepositoryPublicationRegistry,
    FilesystemRepositoryPublicationUploadStore,
    FilesystemRepositoryReplayStore,
    RepositoryReadEndpoint,
} from "@bernouy/cms-repository/repository/filesystem";
import {
    RepositoryNamespaceAuthority,
    RepositoryNamespaceEndpoint,
} from "@bernouy/cms-repository/repository/namespaces";
import { RepositoryMutationEndpoint } from "@bernouy/cms-repository/repository/publication";
import { sourceSnapshots } from "./sources";

export const documentationRepositoryEntrypoint = import.meta.path;

// An isolated real filesystem Repository HTTP process; production flock requires Linux.
if (import.meta.main) {
    const [root, rawPort] = process.argv.slice(2);
    if (!root || !rawPort) {
        throw new Error("Repository storage and port are required");
    }
    const namespaces = new RepositoryNamespaceEndpoint(
        new RepositoryNamespaceAuthority("documentation-integration", new FilesystemRepositoryNamespaceStore(root)),
    );
    const authority = new RepositoryNamespaceAuthority(
        "documentation-integration",
        new FilesystemRepositoryNamespaceStore(root),
    );
    const registry = new FilesystemRepositoryPublicationRegistry(root);
    const uploads = new FilesystemRepositoryPublicationUploadStore(root);
    const mutations = new RepositoryMutationEndpoint(registry, {
        namespaces: authority,
        uploads,
        replays: new FilesystemRepositoryReplayStore(root),
    });
    const reads = new RepositoryReadEndpoint(root);
    const sources = await sourceSnapshots(root, { namespaces: authority, registry, uploads }, reads);
    const server = Bun.serve({
        hostname: "127.0.0.1",
        port: Number(rawPort),
        async fetch(request) {
            if (new URL(request.url).pathname === "/readyz") {
                return new Response("ready");
            }
            return (
                (await sources(request)) ??
                (await namespaces.handle(request)) ??
                (await mutations.handle(request)) ??
                (await reads.handle(request)) ??
                new Response(null, { status: 404 })
            );
        },
    });
    process.on("SIGTERM", () => {
        server.stop(true);
    });
}
