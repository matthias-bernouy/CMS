import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    RepositoryNamespaceAuthority,
    RepositoryNamespaceEndpoint,
} from "@bernouy/cms-repository/repository/namespaces";
import {
    FilesystemRepositoryNamespaceStore,
    FilesystemRepositoryPublicationRegistry,
    FilesystemRepositoryPublicationUploadStore,
    FilesystemRepositoryReplayStore,
    RepositoryReadEndpoint,
} from "@bernouy/cms-repository/repository/filesystem";
import { RepositoryMutationEndpoint } from "@bernouy/cms-repository/repository/publication";
import { runCli } from "../../../src/cli";

export async function identityFixture() {
    const root = await mkdtemp(join(tmpdir(), "ulvia-identity-"));
    const remote = join(root, "remote");
    const authority = new RepositoryNamespaceAuthority(
        "test-repository",
        new FilesystemRepositoryNamespaceStore(remote),
    );
    const namespace = new RepositoryNamespaceEndpoint(authority);
    const mutations = new RepositoryMutationEndpoint(new FilesystemRepositoryPublicationRegistry(remote), {
        namespaces: authority,
        uploads: new FilesystemRepositoryPublicationUploadStore(remote),
        replays: new FilesystemRepositoryReplayStore(remote),
    });
    const reads = new RepositoryReadEndpoint(remote);
    const server = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        async fetch(request) {
            return (
                (await namespace.handle(request)) ??
                (await mutations.handle(request)) ??
                (await reads.handle(request)) ??
                new Response(null, { status: 404 })
            );
        },
    });
    const data = join(root, "data");
    const output: string[] = [];
    const options = {
        cwd: root,
        home: root,
        environment: { ULVIA_DATA_DIR: data },
        log: (message: string) => output.push(message),
    };
    return {
        root,
        remote,
        authority,
        server,
        data,
        output,
        options,
        config: join(data, "config"),
        run: (args: string[]) => runCli(args, options),
        async close() {
            server.stop(true);
            await rm(root, { recursive: true, force: true });
        },
    };
}
