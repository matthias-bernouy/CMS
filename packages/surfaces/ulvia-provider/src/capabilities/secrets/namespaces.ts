import { type CmsSecrets, type SecretNamespacePermission } from "@bernouy/cms-secrets";
import type { ProviderCapabilityRegistry } from "../../dispatch/registry";
import { namespaceInput, secretCall, text } from "./validation";

const PERMISSIONS: readonly SecretNamespacePermission[] = [
    "secrets.metadata.read",
    "secrets.resolve",
    "secrets.write",
    "secrets.delete",
    "namespace.manage",
];

export function registerSecretNamespaceCapabilities(dispatcher: ProviderCapabilityRegistry, secrets: CmsSecrets): void {
    dispatcher.register("ulvia.cms.secrets", "namespace.create", async (input, context) =>
        secretCall(() =>
            secrets.createNamespace({
                name: text(input.name),
                createdBy: {
                    kind: context.subjectId ? "administrator" : "system",
                    id: context.subjectId ?? "cms-gateway",
                },
            }),
        ),
    );
    dispatcher.register("ulvia.cms.secrets", "namespace.get", async (input) => {
        const namespace = namespaceInput(input);
        return secretCall(async () => {
            const result = await secrets.getNamespace(namespace.id, namespace.key);
            return { ...result, createdAt: result.createdAt.toISOString() };
        });
    });
    dispatcher.register("ulvia.cms.secrets", "namespace.keys.create", async (input) => {
        const namespace = namespaceInput(input);
        return secretCall(() =>
            secrets.createNamespaceKey({
                namespaceId: namespace.id,
                namespaceKey: namespace.key,
                permissions: permissions(input.permissions),
                ...(input.expiresAt === undefined ? {} : { expiresAt: futureDate(input.expiresAt) }),
            }),
        );
    });
    dispatcher.register("ulvia.cms.secrets", "namespace.keys.rotate", async (input) => {
        const namespace = namespaceInput(input);
        return secretCall(() => secrets.rotateNamespaceKey(namespace.id, namespace.key, text(input.keyId)));
    });
    dispatcher.register("ulvia.cms.secrets", "namespace.keys.revoke", async (input) => {
        const namespace = namespaceInput(input);
        return secretCall(async () => {
            await secrets.revokeNamespaceKey(namespace.id, namespace.key, text(input.keyId));
            return null;
        });
    });
    dispatcher.register("ulvia.cms.secrets", "namespace.delete", async (input) => {
        const namespace = namespaceInput(input);
        return secretCall(async () => {
            await secrets.deleteNamespace(namespace.id, namespace.key);
            return null;
        });
    });
}

function permissions(value: unknown): readonly SecretNamespacePermission[] {
    if (!Array.isArray(value) || value.length === 0 || value.some((item) => !PERMISSIONS.includes(item))) {
        throw new TypeError("invalid secret namespace permissions");
    }
    return value as SecretNamespacePermission[];
}

function futureDate(value: unknown): Date {
    const date = new Date(text(value));
    if (!Number.isFinite(date.getTime()) || date <= new Date()) {
        throw new TypeError("invalid secret namespace key expiration");
    }
    return date;
}
