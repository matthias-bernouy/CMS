import { expect, test } from "bun:test";
import { CmsSecrets } from "@bernouy/cms-secrets";
import { InMemoryCmsSecretMetadataStore } from "@bernouy/cms-secrets/memory";
import { InMemorySecretStore } from "@bernouy/secret-store";
import { createContractSecretStores } from "../../src/runtime/stores/contractSecretStores";

test("contract secret stores keep values isolated and preserve namespace authority", async () => {
    const bootstrap = new InMemorySecretStore();
    const values = new InMemorySecretStore();
    const secrets = new CmsSecrets(new InMemoryCmsSecretMetadataStore(), values);
    const first = await createContractSecretStores(secrets, bootstrap);

    await first.files.set("SHARED_NAME", "files-value");
    await first.installations.set("SHARED_NAME", "installation-value");

    expect(await first.emailer.get("SHARED_NAME")).toBeNull();
    expect(await first.files.get("SHARED_NAME")).toBe("files-value");
    expect(await first.installations.get("SHARED_NAME")).toBe("installation-value");
    expect((await bootstrap.listKeys()).sort()).toEqual([
        "CMS_SECRET_NAMESPACE_EMAILER",
        "CMS_SECRET_NAMESPACE_FILES",
        "CMS_SECRET_NAMESPACE_INSTALLATIONS",
    ]);

    const resumed = await createContractSecretStores(secrets, bootstrap);
    expect(await resumed.emailer.get("SHARED_NAME")).toBeNull();
    expect(await resumed.files.get("SHARED_NAME")).toBe("files-value");
    expect(await resumed.installations.get("SHARED_NAME")).toBe("installation-value");
});

test("Emailer owns a writable namespace without access to other contract values", async () => {
    const bootstrap = new InMemorySecretStore();
    const secrets = new CmsSecrets(new InMemoryCmsSecretMetadataStore(), new InMemorySecretStore());
    const stores = await createContractSecretStores(secrets, bootstrap);

    await stores.emailer.set("EMAILER_CONFIGURATION", "secret");

    expect(await stores.emailer.get("EMAILER_CONFIGURATION")).toBe("secret");
    expect(await stores.files.get("EMAILER_CONFIGURATION")).toBeNull();
});
