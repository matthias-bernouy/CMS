import { createRequire } from "node:module";
import { join } from "node:path";
import { assertOwnedNamespaceCleanup } from "./ownership";
import type { NamespaceCleanupRequest } from "./ownership";
import type { MongoClient as Client } from "mongodb";
import type { EncryptedSecretDocument } from "@bernouy/secret-store/mongo";

const workspace = createRequire("/app/packages/runtimes/ulvia-provider-server/package.json");
const { MongoClient } = workspace("mongodb");
const input: NamespaceCleanupRequest = await Bun.stdin.json();
assertOwnedNamespaceCleanup(
    { id: input.stackId, providerName: input.providerName, instanceId: input.instanceId },
    input,
    input.name,
);
const url = new URL(process.env.MONGO_URL!);
if (
    url.hostname !== "mongo" ||
    url.pathname !== "/mcp_provider_control" ||
    process.env.CMS_FILES_DIR !== "/var/lib/cms/files"
) {
    throw new Error("Not a disposable performance deployment");
}
const client: Client = new MongoClient(url.href);
try {
    await client.connect();
    const instance = await client.db().collection("ulvia_provider_instances").findOne({ id: input.instanceId });
    if (
        !instance ||
        typeof instance.idempotencyKey !== "string" ||
        !instance.idempotencyKey.startsWith(input.stackId) ||
        typeof instance.storageKey !== "string" ||
        !/^[a-z0-9][a-z0-9-]{0,62}$/u.test(instance.storageKey)
    ) {
        throw new Error("Instance is not owned by this fixture");
    }
    const db = client.db(`ulvia_${instance.storageKey.replaceAll("-", "_")}`);
    let service: { deleteNamespace(id: string, key: string): Promise<void> };
    let namespace: { name: string } | null;
    if (input.family === "secrets") {
        const { CmsSecrets } = workspace("@bernouy/secrets");
        const { MongoCmsSecretMetadataStore } = workspace("@bernouy/secrets/mongo");
        const metadata = new MongoCmsSecretMetadataStore({
            secrets: db.collection("cms_secret_metadata"),
            namespaces: db.collection("cms_secret_namespaces"),
            namespaceKeys: db.collection("cms_secret_namespace_keys"),
        });
        namespace = await metadata.getNamespace(input.namespaceId);
        const values = {
            get: async () => {
                throw new Error("Cleanup cannot read secrets");
            },
            set: async () => {
                throw new Error("Cleanup cannot create secrets");
            },
            listKeys: async () => {
                throw new Error("Cleanup cannot enumerate secrets");
            },
            delete: async (key: string) => {
                await db.collection<EncryptedSecretDocument>("cms_secrets").deleteOne({ _id: key });
            },
        };
        service = new CmsSecrets(metadata, values);
    } else if (input.family === "files") {
        const { CmsFilesService } = workspace("@bernouy/files");
        const { MongoCmsFilesStore } = workspace("@bernouy/files/mongo");
        const { LocalFsBlobStore } = workspace("@bernouy/blob-store/local-fs");
        const store = new MongoCmsFilesStore(db);
        namespace = await store.getNamespace(input.namespaceId);
        service = new CmsFilesService({
            store,
            blobs: new LocalFsBlobStore(join(process.env.CMS_FILES_DIR, instance.storageKey, "blobs")),
            signingKey: new Uint8Array(32),
            publicBaseUrl: "http://cleanup.localhost",
        });
    } else {
        throw new Error("Unsupported fixture cleanup family");
    }
    if (!namespace || namespace.name !== input.name || !namespace.name.startsWith("performance-")) {
        throw new Error("Namespace is not the exact owned fixture");
    }
    await service.deleteNamespace(input.namespaceId, input.namespaceKey);
    process.stdout.write("cleaned");
} finally {
    await client.close();
}
