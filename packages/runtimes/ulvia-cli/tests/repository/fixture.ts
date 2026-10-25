import { BunRunner } from "@bernouy/http-runner";
import { NOOP_LOGGER } from "@bernouy/logging";
import { createHash, generateKeyPairSync } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
    FilesystemRepositoryPublicationRegistry,
    FilesystemRepositoryPublicationUploadStore,
    FilesystemRepositoryReplayStore,
    FilesystemRepositoryNamespaceStore,
    RepositoryReadEndpoint,
} from "@bernouy/cms-repository/repository/filesystem";
import { RepositoryMutationEndpoint } from "@bernouy/cms-repository/repository/publication";
import {
    RepositoryNamespaceAuthority,
    RepositoryNamespaceClient,
    RepositoryNamespaceEndpoint,
} from "@bernouy/cms-repository/repository/namespaces";
import { runCli } from "../../src/cli";

export function startTestRepository(root: string) {
    const pair = generateKeyPairSync("ed25519");
    const privateKey = pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const publicKey = pair.publicKey.export({ type: "spki", format: "der" }).toString("base64url");
    const namespaces = new RepositoryNamespaceAuthority(
        createHash("sha256").update(root).digest("hex"),
        new FilesystemRepositoryNamespaceStore(root),
    );
    const ownership = new RepositoryNamespaceEndpoint(namespaces);
    const mutations = new RepositoryMutationEndpoint(new FilesystemRepositoryPublicationRegistry(root), {
        namespaces,
        uploads: new FilesystemRepositoryPublicationUploadStore(root),
        replays: new FilesystemRepositoryReplayStore(root),
    });
    const reads = new RepositoryReadEndpoint(root);
    const runner = new BunRunner({ hostname: "127.0.0.1", logger: NOOP_LOGGER });
    const handle = async (request: Request) =>
        (await ownership.handle(request)) ??
        (await mutations.handle(request)) ??
        (await reads.handle(request)) ??
        new Response(null, { status: 404 });
    for (const method of ["GET", "HEAD", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "QUERY"] as const) {
        runner.setDefaultEndpoint(method, handle);
    }
    runner.start(0);
    const url = `http://127.0.0.1:${runner.port}`;
    const claim = async (namespace = "ulvia.official") => {
        const credential = {
            namespace,
            repositoryId: namespaces.repositoryId,
            revision: 0,
            resolvePrivateKey: async () => privateKey,
        };
        await new RepositoryNamespaceClient(url).claim(credential, publicKey);
        return { ...credential, revision: 1 };
    };
    return {
        url,
        stop: () => runner.stop(),
        claim,
        async connect(data: string) {
            await claim();
            const keyFile = join(data, "test-owner.pem");
            await writeFile(keyFile, privateKey, { mode: 0o600, flag: "wx" });
            const options = { environment: { ULVIA_DATA_DIR: data }, log: () => undefined };
            await runCli(["identity", "import", "owner", "--key-file", keyFile], options);
            await runCli(["repository", "login", url, "--identity", "owner"], options);
        },
    };
}
