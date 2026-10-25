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

    await first.repository.set("SHARED_NAME", "repository-value");
    await first.files.set("SHARED_NAME", "files-value");
    await first.installations.set("SHARED_NAME", "installation-value");

    expect(await first.smtpEmailer.get("SHARED_NAME")).toBeNull();
    expect(await first.files.get("SHARED_NAME")).toBe("files-value");
    expect(await first.installations.get("SHARED_NAME")).toBe("installation-value");
    expect((await bootstrap.listKeys()).sort()).toEqual([
        "CMS_SECRET_NAMESPACE_FILES",
        "CMS_SECRET_NAMESPACE_INSTALLATIONS",
        "CMS_SECRET_NAMESPACE_REPOSITORY",
        "CMS_SECRET_NAMESPACE_SMTP_EMAILER",
    ]);

    const resumed = await createContractSecretStores(secrets, bootstrap);
    expect(await resumed.smtpEmailer.get("SHARED_NAME")).toBeNull();
    expect(await resumed.repository.get("SHARED_NAME")).toBe("repository-value");
    expect(await resumed.files.get("SHARED_NAME")).toBe("files-value");
    expect(await resumed.installations.get("SHARED_NAME")).toBe("installation-value");
});

test("SMTP Emailer owns a writable namespace without access to other contract values", async () => {
    const bootstrap = new InMemorySecretStore();
    const secrets = new CmsSecrets(new InMemoryCmsSecretMetadataStore(), new InMemorySecretStore());
    const stores = await createContractSecretStores(secrets, bootstrap);

    await stores.smtpEmailer.set("SMTP_EMAILER_CONFIGURATION", "secret");

    expect(await stores.smtpEmailer.get("SMTP_EMAILER_CONFIGURATION")).toBe("secret");
    expect(await stores.files.get("SMTP_EMAILER_CONFIGURATION")).toBeNull();
});
