import { mapSecretsError } from "cms-secrets/capabilities/mapError";
import { defineFeature } from "@bernouy/ulvia-sdk";
import { createNamespaceKey } from "cms-secrets/capabilities/namespaces/keys/create";
import { createNamespace } from "cms-secrets/capabilities/namespaces/create";
import { createSecret } from "cms-secrets/capabilities/secrets/create";
import { deleteNamespace } from "cms-secrets/capabilities/namespaces/delete";
import { deleteSecret } from "cms-secrets/capabilities/secrets/delete";
import { revokeNamespaceKey } from "cms-secrets/capabilities/namespaces/keys/revoke";
import { rotateNamespaceKey } from "cms-secrets/capabilities/namespaces/keys/rotate";
import { rotateSecret } from "cms-secrets/capabilities/secrets/rotate";
import { getSecretMetadataByName } from "cms-secrets/capabilities/secrets/metadata/getByName";
import { getSecretMetadata } from "cms-secrets/capabilities/secrets/metadata/get";
import { getNamespace } from "cms-secrets/capabilities/namespaces/get";
import { listSecrets } from "cms-secrets/capabilities/secrets/list";
import { resolveSecret } from "cms-secrets/capabilities/secrets/resolve";

export const secretsFeature = defineFeature({
    contractId: "ulvia/cms.secrets",
    name: "CMS Secrets",
    description: "Manage credential-owned secret namespaces and encrypted CMS secret values.",
    version: "1.0.0",
    publisherId: "ulvia",
    catalogue: {
        icon: "key",
        categories: ["administration", "infrastructure"],
    },
    documents: new URL("../docs/", import.meta.url),
    mapError: mapSecretsError,
    capabilities: [
        createNamespaceKey,
        createNamespace,
        createSecret,
        deleteNamespace,
        deleteSecret,
        revokeNamespaceKey,
        rotateNamespaceKey,
        rotateSecret,
        getSecretMetadataByName,
        getSecretMetadata,
        getNamespace,
        listSecrets,
        resolveSecret,
    ],
});

export type { SecretsServices, SecretsService } from "cms-secrets/interfaces/SecretsServices";
