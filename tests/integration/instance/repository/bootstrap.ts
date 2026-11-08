import { dirname, resolve } from "node:path";
import { parseContractReleaseJson } from "@bernouy/ulvia-contracts";
import { RepositoryNamespaceClient } from "@bernouy/repository/repository/namespaces";
import { RemoteRepositoryClient } from "@bernouy/repository/repository/publication";

export async function publishBundledReleases(url: string, providerUrl: string, token: string) {
    const root = resolve(import.meta.dir, "../../../../packages/runtimes/ulvia-cli/dist/bootstrap");
    const index = await Bun.file(resolve(root, "index.json")).json();
    const repositoryId = await new RepositoryNamespaceClient(url).identity();
    const namespace = new RepositoryNamespaceClient(url, {
        credential: {
            origin: new URL(url).origin,
            repositoryId,
            resolveToken: async () => token,
        },
    });
    await namespace.claim("ulvia");
    const client = new RemoteRepositoryClient(url, await namespace.ownedCredential("ulvia"));
    for (const path of index.contracts as string[]) {
        const canonicalJson = await Bun.file(resolve(root, path)).text();
        const release = parseContractReleaseJson(canonicalJson);
        await client.push({
            kind: "contract",
            canonicalJson,
            assets: (release.documentation ?? []).map((document) => ({
                id: `docs/${document.path}`,
                bytes: Bun.file(resolve(root, dirname(path), "docs", document.path)),
            })),
        });
    }
    const manifest = await Bun.file(resolve(root, index.provider)).json();
    if (!manifest.endpoint.allowedOrigins.includes(providerUrl)) {
        throw new Error("Documentation Provider must use an origin admitted by the bundled manifest");
    }
    await client.push({ kind: "provider-manifest", canonicalJson: JSON.stringify(manifest), assets: [] });
}
