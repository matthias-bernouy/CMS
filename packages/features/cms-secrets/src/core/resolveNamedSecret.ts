import type { SecretStore } from "@bernouy/secret-store";
import type { CmsSecretMetadataStore } from "cms-secrets/interfaces/CmsSecretMetadataStore";
import type { CmsSecretResolutionReader } from "cms-secrets/interfaces/CmsSecretResolutionReader";
import { authorizeNamespaceKey, credentialId, credentialVerifier } from "cms-secrets/core/credentials";
import { CmsSecretNotFound } from "cms-secrets/core/errors";

/** A joined read changes persistence scheduling, never namespace authorization or plaintext access. */
export async function resolveNamedSecret(
    metadata: CmsSecretMetadataStore,
    values: SecretStore,
    now: () => Date,
    input: { namespaceId: string; namespaceKey: string; name: string },
    reader?: CmsSecretResolutionReader,
) {
    const { namespaceId, namespaceKey, name } = input;
    const keyId = credentialId(namespaceKey, "snk");
    const permissions = ["secrets.metadata.read", "secrets.resolve"] as const;
    const prepared = reader
        ? await reader.read({
              namespaceId,
              keyId,
              name,
              verifier: await credentialVerifier(namespaceKey),
              permissions,
              checkedAt: now(),
          })
        : undefined;
    await authorizeNamespaceKey(
        namespaceId,
        namespaceKey,
        prepared ? prepared.key : await metadata.getNamespaceKey(keyId),
        permissions,
        now(),
    );
    const secret = prepared ? prepared.metadata : await metadata.findByName(namespaceId, name);
    if (!secret) {
        return null;
    }
    if (secret.namespaceId !== namespaceId || secret.name !== name) {
        throw new CmsSecretNotFound("secret does not exist");
    }
    const value = prepared ? await prepared.resolveValue() : await values.get(secret.storageKey);
    if (value === null) {
        throw new CmsSecretNotFound("secret value is unavailable");
    }
    return { namespaceId, secretId: secret.id, version: secret.version, value };
}
