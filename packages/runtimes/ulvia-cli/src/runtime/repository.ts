import { RepositoryMutationEndpoint } from "../repository/remote/endpoint";
import { RepositoryReadEndpoint } from "../repository/remote/readEndpoint";

/** Serve only releases explicitly stored in the persistent local repository. */
export function startLocalRepository(port: number, root: string, writeToken?: string) {
    const mutations = new RepositoryMutationEndpoint(root, writeToken);
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
