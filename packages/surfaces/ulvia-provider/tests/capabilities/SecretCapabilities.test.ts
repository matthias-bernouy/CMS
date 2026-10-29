import { expect, test } from "bun:test";
import { CmsSecrets } from "@bernouy/cms-secrets";
import { InMemoryCmsSecretMetadataStore } from "@bernouy/cms-secrets/memory";
import { InMemorySecretStore } from "@bernouy/secret-store";
import { DefaultProviderCapabilityDispatcher, type ProviderCapabilityInvocationContext } from "@bernouy/ulvia-provider";
import { registerSecretCapabilities } from "@bernouy/ulvia-provider/capabilities";

const context: ProviderCapabilityInvocationContext = {
    requestId: "00000000-0000-4000-8000-000000000001",
    contractVersion: "1.0.0",
    siteId: "site-a",
    providerId: "ulvia.official",
};

test("secret capabilities expose namespace-scoped lifecycle operations", async () => {
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    registerSecretCapabilities(dispatcher, secrets());
    const namespace = await invoke<{ namespaceId: string; keyId: string; namespaceKey: string }>(
        dispatcher,
        "namespace.create",
        { name: "Payments" },
    );
    const created = await invoke<{ secretId: string }>(dispatcher, "secrets.create", {
        ...namespaceInput(namespace),
        name: "stripe-token",
        value: "secret-value",
    });

    expect(
        await invoke(dispatcher, "secrets.get-metadata", {
            ...namespaceInput(namespace),
            secretId: created.secretId,
        }),
    ).toMatchObject({ namespaceId: namespace.namespaceId, name: "stripe-token", version: 1 });
    expect(
        await invoke(dispatcher, "secrets.get-metadata-by-name", {
            ...namespaceInput(namespace),
            name: "stripe-token",
        }),
    ).toMatchObject({ secretId: created.secretId, name: "stripe-token" });
    expect(
        await invoke(dispatcher, "secrets.get-metadata-by-name", {
            ...namespaceInput(namespace),
            name: "missing",
        }),
    ).toBeNull();
    expect(
        await invoke(dispatcher, "secrets.resolve", {
            ...namespaceInput(namespace),
            secretId: created.secretId,
        }),
    ).toMatchObject({ value: "secret-value" });
});

test("secret capabilities reject a namespace key without resolve permission", async () => {
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    registerSecretCapabilities(dispatcher, secrets());
    const namespace = await invoke<{ namespaceId: string; namespaceKey: string }>(dispatcher, "namespace.create", {
        name: "Payments",
    });
    const created = await invoke<{ secretId: string }>(dispatcher, "secrets.create", {
        ...namespaceInput(namespace),
        name: "stripe-token",
        value: "secret-value",
    });
    const metadataKey = await invoke<{ namespaceKey: string }>(dispatcher, "namespace.keys.create", {
        ...namespaceInput(namespace),
        permissions: ["secrets.metadata.read"],
    });

    await expect(
        invoke(dispatcher, "secrets.resolve", {
            namespaceId: namespace.namespaceId,
            namespaceKey: metadataKey.namespaceKey,
            secretId: created.secretId,
        }),
    ).rejects.toMatchObject({ code: "NOT_AUTHORIZED", status: 403 });
});

function secrets(): CmsSecrets {
    return new CmsSecrets(new InMemoryCmsSecretMetadataStore(), new InMemorySecretStore(), {
        createId: () => "secret-1",
        now: () => new Date("2026-10-22T10:00:00.000Z"),
    });
}

function namespaceInput(namespace: { namespaceId: string; namespaceKey: string }) {
    return { namespaceId: namespace.namespaceId, namespaceKey: namespace.namespaceKey };
}

function invoke<T = unknown>(
    dispatcher: DefaultProviderCapabilityDispatcher,
    capabilityId: string,
    input: Record<string, unknown>,
): Promise<T> {
    return dispatcher.invoke("ulvia.cms.secrets", capabilityId, input, context) as Promise<T>;
}
