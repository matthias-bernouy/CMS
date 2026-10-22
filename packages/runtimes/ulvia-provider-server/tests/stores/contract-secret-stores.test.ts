import { expect, test } from "bun:test";
import { CmsSecretNotAuthorized, CmsSecrets } from "@bernouy/cms-secrets";
import { InMemoryCmsSecretMetadataStore } from "@bernouy/cms-secrets/memory";
import { InMemorySecretStore, type SecretStore } from "@bernouy/secret-store";
import { createContractSecretStores } from "../../src/runtime/stores/contractSecretStores";

test("contract secret stores keep values isolated and preserve namespace authority", async () => {
    const bootstrap = new InMemorySecretStore();
    const values = new InMemorySecretStore();
    const secrets = new CmsSecrets(new InMemoryCmsSecretMetadataStore(), values);
    const first = await createContractSecretStores(secrets, bootstrap);

    await first.files.set("SHARED_NAME", "files-value");
    await first.installations.set("SHARED_NAME", "installation-value");

    expect(await first.access.get("SHARED_NAME")).toBeNull();
    expect(await first.files.get("SHARED_NAME")).toBe("files-value");
    expect(await first.installations.get("SHARED_NAME")).toBe("installation-value");
    expect((await bootstrap.listKeys()).sort()).toEqual([
        "CMS_SECRET_NAMESPACE_ACCESS",
        "CMS_SECRET_NAMESPACE_FILES",
        "CMS_SECRET_NAMESPACE_INSTALLATIONS",
    ]);

    const resumed = await createContractSecretStores(secrets, bootstrap);
    expect(await resumed.access.get("SHARED_NAME")).toBeNull();
    expect(await resumed.files.get("SHARED_NAME")).toBe("files-value");
    expect(await resumed.installations.get("SHARED_NAME")).toBe("installation-value");
});

test("read-only Access namespace credentials cannot write secrets", async () => {
    const bootstrap = new InMemorySecretStore();
    const secrets = new CmsSecrets(new InMemoryCmsSecretMetadataStore(), new InMemorySecretStore());
    const stores = await createContractSecretStores(secrets, bootstrap);

    await expect((stores.access as SecretStore).set("SMTP_PASSWORD", "secret")).rejects.toBeInstanceOf(
        CmsSecretNotAuthorized,
    );
});
