import {
    RepositoryNamespaceClient,
    type RepositoryOwnerCredential,
} from "@bernouy/cms-repository/repository/namespaces";
import { clientConfigDirectory } from "../../runtime/repository/config";
import { assertSavedRepository } from "../../runtime/repository/connection";
import { selectIdentity } from "../../runtime/repository/identities";
import { readNamespacePrivateKey } from "../../runtime/repository/keys";

export async function remoteRepositoryCredential(
    url: string,
    namespace: string,
    environment: Record<string, string | undefined>,
): Promise<RepositoryOwnerCredential> {
    const client = new RepositoryNamespaceClient(url);
    const [repositoryId, state] = await Promise.all([client.identity(), client.get(namespace)]);
    const directory = clientConfigDirectory(environment);
    await assertSavedRepository(directory, url, repositoryId);
    if (!state || state.revoked) {
        throw new Error("Repository namespace is unavailable or revoked");
    }
    const { keyFile } = await selectIdentity(directory, undefined, state.publicKey);
    return {
        namespace,
        repositoryId,
        revision: state.revision,
        resolvePrivateKey: () => readNamespacePrivateKey(keyFile),
    };
}
