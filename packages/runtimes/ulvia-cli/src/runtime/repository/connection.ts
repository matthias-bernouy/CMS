import { randomUUID } from "node:crypto";
import { RepositoryNamespaceClient } from "@bernouy/repository/repository/namespaces";
import type { RepositoryConnectionCredential } from "@bernouy/repository/repository/namespaces";
import { readClientConfig, updateClientConfig } from "./config";

function normalizeRepositoryUrl(value: string): string {
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

export async function loginRepository(directory: string, value: string, token: string): Promise<string> {
    const url = normalizeRepositoryUrl(value);
    if (!/^pat_[A-Za-z0-9_-]{43}$/u.test(token)) {
        throw new Error("Provide a valid Repository PAT through ULVIA_REPOSITORY_TOKEN or --token-stdin");
    }
    const before = (await readClientConfig(directory)).repository;
    const repositoryId = await new RepositoryNamespaceClient(url).identity();
    if (before?.url === url && before.repositoryId !== repositoryId) {
        throw new Error("Repository identity changed; inspect the deployment before logout and login");
    }
    const credential: RepositoryConnectionCredential = { origin: url, repositoryId, resolveToken: async () => token };
    await new RepositoryNamespaceClient(url, { credential }).list();
    await updateClientConfig(directory, async (config) => {
        if (config.repository?.generation !== before?.generation) {
            throw new Error("Repository connection changed during login");
        }
        config.repository = { url, repositoryId, token, generation: randomUUID() };
    });
    return repositoryId;
}

export async function savedRepositoryCredential(
    directory: string,
    value: string,
): Promise<RepositoryConnectionCredential> {
    const url = normalizeRepositoryUrl(value);
    const expected = (await readClientConfig(directory)).repository;
    if (!expected || expected.url !== url) {
        throw new Error("No credentials for this Repository origin; run ulvia repository login first");
    }
    const { repositoryId, generation } = expected;
    return {
        origin: url,
        repositoryId,
        resolveToken: async () => {
            const current = (await readClientConfig(directory)).repository;
            if (
                !current ||
                current.url !== url ||
                current.repositoryId !== repositoryId ||
                current.generation !== generation
            ) {
                throw new Error("Repository connection changed");
            }
            return current.token;
        },
    };
}
