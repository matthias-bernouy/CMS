import {
    FilesystemRepositoryPublicationRegistry,
    FilesystemRepositoryPublicationUploadStore,
    FilesystemRepositoryReplayStore,
    RepositoryReadEndpoint,
} from "@bernouy/cms-repository/repository/filesystem";
import { RepositoryMutationEndpoint } from "@bernouy/cms-repository/repository/publication";
import type { Logger } from "@bernouy/logging";
import { BunRunner, type HttpMethod } from "@bernouy/http-runner";

const HTTP_METHODS: readonly HttpMethod[] = ["GET", "HEAD", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "QUERY"];

/** Serve only releases explicitly stored in the persistent local repository. */
export function startLocalRepository(port: number, root: string, logger: Logger, writeToken?: string) {
    const mutations = new RepositoryMutationEndpoint(new FilesystemRepositoryPublicationRegistry(root), {
        token: writeToken,
        uploads: writeToken ? new FilesystemRepositoryPublicationUploadStore(root) : undefined,
        replays: writeToken ? new FilesystemRepositoryReplayStore(root) : undefined,
    });
    const reads = new RepositoryReadEndpoint(root);
    const runner = new BunRunner({ hostname: "127.0.0.1", logger });
    const handle = async (request: Request) => {
        return (
            (await mutations.handle(request)) ?? (await reads.handle(request)) ?? new Response(null, { status: 405 })
        );
    };
    for (const method of HTTP_METHODS) {
        runner.setDefaultEndpoint(method, handle);
    }
    runner.start(port);
    return {
        url: `http://127.0.0.1:${runner.port}`,
        stop: () => runner.stop(),
    };
}
