import { type CmsSecrets } from "@bernouy/cms-secrets";
import type { ProviderCapabilityRegistry } from "../../dispatch/registry";
import { namespaceInput, positiveInteger, secretCall, text } from "./validation";
import { registerSecretNamespaceCapabilities } from "./namespaces";

export function registerSecretCapabilities(dispatcher: ProviderCapabilityRegistry, secrets: CmsSecrets): void {
    registerSecretNamespaceCapabilities(dispatcher, secrets);
    dispatcher.register("ulvia.cms.secrets", "secrets.create", async (input) => {
        const namespace = namespaceInput(input);
        return secretCall(
            () => secrets.create(namespace.id, namespace.key, text(input.name), text(input.value)),
            "ALREADY_EXISTS",
        );
    });
    dispatcher.register("ulvia.cms.secrets", "secrets.rotate", async (input) => {
        const namespace = namespaceInput(input);
        return secretCall(() =>
            secrets.rotate(
                namespace.id,
                namespace.key,
                text(input.secretId),
                positiveInteger(input.expectedVersion),
                text(input.value),
            ),
        );
    });
    dispatcher.register("ulvia.cms.secrets", "secrets.delete", async (input) => {
        const namespace = namespaceInput(input);
        return secretCall(async () => ({
            deleted: await secrets.delete(
                namespace.id,
                namespace.key,
                text(input.secretId),
                positiveInteger(input.expectedVersion),
            ),
        }));
    });
    dispatcher.register("ulvia.cms.secrets", "secrets.get-metadata", async (input) => {
        const namespace = namespaceInput(input);
        return secretCall(() => secrets.get(namespace.id, namespace.key, text(input.secretId)));
    });
    dispatcher.register("ulvia.cms.secrets", "secrets.list", async (input) => {
        const namespace = namespaceInput(input);
        return secretCall(async () => ({
            items: await secrets.list(
                namespace.id,
                namespace.key,
                input.limit === undefined ? 100 : positiveInteger(input.limit),
            ),
        }));
    });
    dispatcher.register("ulvia.cms.secrets", "secrets.resolve", async (input) => {
        const namespace = namespaceInput(input);
        return secretCall(() => secrets.resolve(namespace.id, namespace.key, text(input.secretId)));
    });
}
