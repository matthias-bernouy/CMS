import { RepositoryNamespaceClient } from "@bernouy/repository/repository/namespaces";
import type { RepositoryNamespaceCredential } from "@bernouy/repository/repository/namespaces";
import { clientConfigDirectory } from "../../runtime/repository/config";
import { savedRepositoryCredential } from "../../runtime/repository/connection";

export async function remoteRepositoryCredential(
    url: string,
    namespace: string,
    environment: Record<string, string | undefined>,
): Promise<RepositoryNamespaceCredential> {
    const credential = await savedRepositoryCredential(clientConfigDirectory(environment), url);
    return new RepositoryNamespaceClient(url, { credential }).ownedCredential(namespace);
}
