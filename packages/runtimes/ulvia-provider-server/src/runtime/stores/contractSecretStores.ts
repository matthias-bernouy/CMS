import { CmsSecretNamespaceStore, type CmsSecrets, type SecretNamespacePermission } from "@bernouy/cms-secrets";
import { ValidatingSecretStore, type SecretStore } from "@bernouy/secret-store";

type StoredNamespaceAuthority = Readonly<{
    namespaceId: string;
    administratorKey: string;
    consumerKey?: string;
}>;

type NamespaceDefinition = Readonly<{
    bootstrapKey: string;
    name: string;
    permissions: readonly SecretNamespacePermission[];
}>;

export type ContractSecretStores = Readonly<{
    smtpEmailer: SecretStore;
    files: SecretStore;
    installations: SecretStore;
}>;

const WRITE_PERMISSIONS = ["secrets.metadata.read", "secrets.resolve", "secrets.write", "secrets.delete"] as const;

const DEFINITIONS = {
    smtpEmailer: {
        bootstrapKey: "CMS_SECRET_NAMESPACE_SMTP_EMAILER",
        name: "ulvia.cms.emailer.smtp",
        permissions: WRITE_PERMISSIONS,
    },
    files: {
        bootstrapKey: "CMS_SECRET_NAMESPACE_FILES",
        name: "ulvia.cms.files",
        permissions: WRITE_PERMISSIONS,
    },
    installations: {
        bootstrapKey: "CMS_SECRET_NAMESPACE_INSTALLATIONS",
        name: "ulvia.cms.installations",
        permissions: WRITE_PERMISSIONS,
    },
} as const satisfies Record<keyof ContractSecretStores, NamespaceDefinition>;

/** Bootstraps one least-privilege CMS Secrets namespace per contract implementation. */
export async function createContractSecretStores(
    secrets: CmsSecrets,
    bootstrap: SecretStore,
): Promise<ContractSecretStores> {
    const entries = await Promise.all(
        Object.entries(DEFINITIONS).map(async ([contract, definition]) => [
            contract,
            await createContractSecretStore(secrets, bootstrap, definition),
        ]),
    );
    return Object.fromEntries(entries) as ContractSecretStores;
}

async function createContractSecretStore(
    secrets: CmsSecrets,
    bootstrap: SecretStore,
    definition: NamespaceDefinition,
): Promise<SecretStore> {
    let authority = parseAuthority(await bootstrap.get(definition.bootstrapKey));
    if (!authority) {
        const created = await secrets.createNamespace({
            name: definition.name,
            createdBy: { kind: "system", id: "ulvia-provider-runtime" },
        });
        authority = {
            namespaceId: created.namespaceId,
            administratorKey: created.namespaceKey,
        };
        await persistAuthority(bootstrap, definition.bootstrapKey, authority);
    }
    if (!authority.consumerKey) {
        const consumer = await secrets.createNamespaceKey({
            namespaceId: authority.namespaceId,
            namespaceKey: authority.administratorKey,
            permissions: definition.permissions,
        });
        authority = { ...authority, consumerKey: consumer.namespaceKey };
        await persistAuthority(bootstrap, definition.bootstrapKey, authority);
    }
    const consumerKey = authority.consumerKey;
    if (!consumerKey) {
        throw new Error("CMS contract secret namespace consumer authority is unavailable");
    }
    return new ValidatingSecretStore(
        new CmsSecretNamespaceStore(secrets, {
            namespaceId: authority.namespaceId,
            namespaceKey: consumerKey,
        }),
    );
}

function parseAuthority(value: string | null): StoredNamespaceAuthority | null {
    if (value === null) {
        return null;
    }
    const parsed: unknown = JSON.parse(value);
    if (
        !parsed ||
        typeof parsed !== "object" ||
        typeof (parsed as Partial<StoredNamespaceAuthority>).namespaceId !== "string" ||
        typeof (parsed as Partial<StoredNamespaceAuthority>).administratorKey !== "string" ||
        ((parsed as Partial<StoredNamespaceAuthority>).consumerKey !== undefined &&
            typeof (parsed as Partial<StoredNamespaceAuthority>).consumerKey !== "string")
    ) {
        throw new Error("CMS contract secret namespace authority is invalid");
    }
    return parsed as StoredNamespaceAuthority;
}

function persistAuthority(bootstrap: SecretStore, key: string, authority: StoredNamespaceAuthority): Promise<void> {
    return bootstrap.set(key, JSON.stringify(authority));
}
