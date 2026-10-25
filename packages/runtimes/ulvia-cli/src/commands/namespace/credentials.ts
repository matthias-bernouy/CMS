import { constants } from "node:fs";
import { open } from "node:fs/promises";
import {
    RepositoryNamespaceClient,
    type RepositoryWriteCredential,
} from "@bernouy/cms-repository/repository/namespaces";

export async function readNamespacePrivateKey(path: string): Promise<string> {
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
        const metadata = await handle.stat();
        if (!metadata.isFile() || metadata.size > 4_096 || (metadata.mode & 0o077) !== 0) {
            throw new Error("Namespace private key must be a private regular file of at most 4096 bytes");
        }
        return await handle.readFile("utf8");
    } finally {
        await handle.close();
    }
}

export async function remoteRepositoryCredential(
    url: string,
    namespace: string,
    environment: Record<string, string | undefined>,
): Promise<RepositoryWriteCredential | undefined> {
    const path = environment.ULVIA_REPOSITORY_PRIVATE_KEY_FILE?.trim();
    if (!path) {
        return environment.ULVIA_REPOSITORY_TOKEN?.trim();
    }
    const client = new RepositoryNamespaceClient(url);
    const [repositoryId, state] = await Promise.all([client.identity(), client.get(namespace)]);
    if (!state || state.revoked) {
        throw new Error("Repository namespace is unavailable or revoked");
    }
    return {
        namespace,
        repositoryId,
        revision: state.revision,
        resolvePrivateKey: () => readNamespacePrivateKey(path),
    };
}
