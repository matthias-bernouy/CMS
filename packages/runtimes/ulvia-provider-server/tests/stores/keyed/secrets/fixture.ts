import { CmsSecrets } from "@bernouy/cms-secrets";
import { InMemoryCmsSecretMetadataStore } from "@bernouy/cms-secrets/memory";
import { InMemorySecretStore } from "@bernouy/secret-store";
import { DefaultProviderCapabilityDispatcher } from "@bernouy/ulvia-provider";
import { loadOfficialFeatures, registerOfficialFeatures } from "@bernouy/ulvia-provider/capabilities";
import { compileProviderRoutes } from "@bernouy/cms-gateway/provider/server";
import { receiptFixture, scope } from "../fixture";

export async function durableSecrets() {
    const metadata = new InMemoryCmsSecretMetadataStore();
    const values = new InMemorySecretStore();
    const counts = { credentials: 0, writes: 0 };
    const getKey = metadata.getNamespaceKey.bind(metadata);
    metadata.getNamespaceKey = async (id) => {
        counts.credentials++;
        return getKey(id);
    };
    const set = values.set.bind(values);
    values.set = async (key, value) => {
        counts.writes++;
        return set(key, value);
    };
    let instant = Date.now();
    const service = new CmsSecrets(metadata, values, { now: () => new Date(instant) });
    const namespace = await service.createNamespace({
        name: "Private",
        createdBy: { kind: "administrator", id: "admin-a" },
    });
    const consumer = await service.createNamespaceKey({
        namespaceId: namespace.namespaceId,
        namespaceKey: namespace.namespaceKey,
        permissions: ["secrets.write"],
        expiresAt: new Date(instant + 60_000),
    });
    const credentials = { namespaceId: namespace.namespaceId, namespaceKey: consumer.namespaceKey };
    const receipts = receiptFixture();
    const build = await loadOfficialFeatures();
    const views = build.implementedContracts.filter(({ release }) => release.contractId === "ulvia/cms.secrets");
    const routes = compileProviderRoutes(views);
    const releases = build.implementations.filter(({ contractId }) => contractId === "ulvia/cms.secrets");
    const mount = async () => {
        const dispatcher = new DefaultProviderCapabilityDispatcher();
        await registerOfficialFeatures(dispatcher, { secrets: service }, releases, {
            ...scope,
            scope,
            executeKeyed: receipts.executor().execute,
        });
        dispatcher.seal(views);
        return (capabilityId: string, input: Record<string, unknown>, key: string) => {
            const route = routes.find(({ capability }) => capability.id === capabilityId)!;
            const binding = route.capability.binding;
            const path = binding.path.replace(/\{([^}]+)\}/gu, (_match, name: string) =>
                encodeURIComponent(String(input[name])),
            );
            return dispatcher.invoke("ulvia/cms.secrets", capabilityId, input, {
                ...scope,
                contractVersion: route.contractVersion,
                requestId: crypto.randomUUID(),
                actorKind: "administrator",
                subjectId: "admin-a",
                invocation: { contractId: "ulvia/cms.secrets", instanceId: scope.instanceId },
                idempotencyKey: key,
                http: {
                    headers: new Headers(),
                    transportRequest: new Request(`http://provider.test${path}`, { method: binding.method }),
                },
            });
        };
    };
    const revoke = () => service.revokeNamespaceKey(namespace.namespaceId, namespace.namespaceKey, consumer.keyId);
    return {
        mount,
        service,
        namespace,
        consumer,
        credentials,
        counts,
        receipts,
        revoke,
        expire: () => {
            instant += 60_001;
        },
    };
}
