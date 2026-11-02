import { generateKeyPairSync } from "node:crypto";
import { dirname, resolve } from "node:path";
import { parseContractReleaseJson } from "@bernouy/cms-repository/contracts";
import { RepositoryNamespaceClient } from "@bernouy/cms-repository/repository/namespaces";
import { RemoteRepositoryClient } from "@bernouy/cms-repository/repository/publication";

export async function publishDocumentationBootstrap(url: string, providerUrl: string) {
    const root = resolve(import.meta.dir, "../../../../packages/runtimes/ulvia-cli/dist/bootstrap");
    const index = await Bun.file(resolve(root, "index.json")).json();
    const pair = generateKeyPairSync("ed25519");
    const privateKey = pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const credential = {
        namespace: "ulvia.official",
        repositoryId: "documentation-integration",
        revision: 0,
        resolvePrivateKey: async () => privateKey,
    };
    await new RepositoryNamespaceClient(url).claim(
        credential,
        pair.publicKey.export({ type: "spki", format: "der" }).toString("base64url"),
    );
    const client = new RemoteRepositoryClient(url, { ...credential, revision: 1 });
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
    // This private Repository admits the actual isolated listener, never a production origin.
    manifest.endpoint = { allowedOrigins: [providerUrl], defaultOrigin: providerUrl };
    await client.push({ kind: "provider-manifest", canonicalJson: JSON.stringify(manifest), assets: [] });
    await client.push({
        kind: "collection",
        canonicalJson: await Bun.file(resolve(root, index.collection)).text(),
        assets: index.collectionAssets.map((asset: { id: string; path: string }) => ({
            id: asset.id,
            bytes: Bun.file(resolve(root, asset.path)),
        })),
    });
}
