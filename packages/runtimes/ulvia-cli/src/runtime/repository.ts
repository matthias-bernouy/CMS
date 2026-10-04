import {
    FilesystemRepositoryPublicationRegistry,
    FilesystemRepositoryPublicationUploadStore,
    FilesystemRepositoryReplayStore,
    RepositoryReadEndpoint,
} from "@bernouy/cms-repository/repository/filesystem";
import { RepositoryMutationEndpoint } from "@bernouy/cms-repository/repository/publication";

/** Serve only releases explicitly stored in the persistent local repository. */
export function startLocalRepository(port: number, root: string, writeToken?: string) {
    const mutations = new RepositoryMutationEndpoint(new FilesystemRepositoryPublicationRegistry(root), {
        token: writeToken,
        uploads: writeToken ? new FilesystemRepositoryPublicationUploadStore(root) : undefined,
        replays: writeToken ? new FilesystemRepositoryReplayStore(root) : undefined,
    });
    const reads = new RepositoryReadEndpoint(root);
    const server = Bun.serve({
        hostname: "127.0.0.1",
        port,
        async fetch(request) {
            const response = (await mutations.handle(request)) ?? (await reads.handle(request));
            return response ?? new Response(null, { status: 405 });
        },
    });
    return { url: `http://127.0.0.1:${server.port}`, stop: () => server.stop(true) };
}
