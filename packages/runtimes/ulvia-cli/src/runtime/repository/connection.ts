import { RepositoryNamespaceClient } from "@bernouy/cms-repository/repository/namespaces";
import { readClientConfig, updateClientConfig } from "./config";
import { ensureDefaultIdentity, selectIdentity } from "./identities";

export function normalizeRepositoryUrl(value: string): string {
    const url = new URL(value);
    if (
        (url.protocol !== "https:" &&
            !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        url.pathname !== "/"
    ) {
        throw new Error("Repository URL must be an HTTPS origin or a loopback HTTP origin");
    }
    return url.origin;
}

export async function assertSavedRepository(directory: string, url: string, repositoryId: string): Promise<void> {
    const saved = (await readClientConfig(directory)).repository;
    if (saved?.url === normalizeRepositoryUrl(url) && saved.repositoryId !== repositoryId) {
        throw new Error("Repository identity changed; inspect the deployment before logout and login");
    }
}

export async function loginRepository(directory: string, value: string, identityName?: string): Promise<string> {
    const url = normalizeRepositoryUrl(value);
    const repositoryId = await new RepositoryNamespaceClient(url).identity();
    await assertSavedRepository(directory, url, repositoryId);
    if (!identityName) {
        await ensureDefaultIdentity(directory);
    }
    await selectIdentity(directory, identityName);
    await updateClientConfig(directory, async (config) => {
        if (config.repository?.url === url && config.repository.repositoryId !== repositoryId) {
            throw new Error("Repository identity changed");
        }
        if (identityName) {
            config.activeIdentity = identityName;
        }
        config.repository = { url, repositoryId };
    });
    return repositoryId;
}
