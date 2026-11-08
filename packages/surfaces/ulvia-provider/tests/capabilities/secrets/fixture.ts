import { expect } from "bun:test";
import { CmsSecrets } from "@bernouy/secrets";
import { InMemoryCmsSecretMetadataStore } from "@bernouy/secrets/memory";
import { InMemorySecretStore } from "@bernouy/secret-store";
import type { secretsFeature } from "@bernouy/secrets/feature";
import type { CapabilityInput, CapabilityOutput, EffectiveCapabilities } from "@bernouy/ulvia-sdk";
import { secretsTransport } from "./transport";

type Capabilities = EffectiveCapabilities<typeof secretsFeature>;
const writes = new Set(["createNamespace", "putNamespaceKey", "deleteNamespace", "create", "replace", "delete"]);

export async function secretsFixture() {
    const backing = new InMemoryCmsSecretMetadataStore();
    const values = new InMemorySecretStore();
    const counts = { mutations: 0, valueReads: 0, valueWrites: 0, listCalls: 0, loaded: 0, limit: 0 };
    const metadata = new Proxy(backing, {
        get(target, key, receiver) {
            const value = Reflect.get(target, key, receiver);
            if (typeof value !== "function") {
                return value;
            }
            return (...args: unknown[]) => {
                if (writes.has(String(key))) {
                    counts.mutations++;
                }
                return value.apply(target, args);
            };
        },
    });
    const list = metadata.list.bind(metadata);
    metadata.list = async (namespaceId, limit) => {
        counts.listCalls++;
        counts.limit = limit;
        const items = await list(namespaceId, limit);
        counts.loaded += items.length;
        return items;
    };
    const get = values.get.bind(values);
    const set = values.set.bind(values);
    let failReads = false;
    values.get = async (key) => {
        counts.valueReads++;
        if (failReads) {
            throw new Error("private-secret-value");
        }
        return get(key);
    };
    values.set = async (key, value) => {
        counts.valueWrites++;
        return set(key, value);
    };
    const service = new CmsSecrets(metadata, values);
    const transport = await secretsTransport(service);
    async function invoke<Id extends keyof Capabilities>(
        id: Id,
        input: CapabilityInput<Capabilities[Id]>,
    ): Promise<CapabilityOutput<Capabilities[Id]>> {
        const response = await transport.call(id, input);
        expect(response.status, id).toBeGreaterThanOrEqual(200);
        expect(response.status, id).toBeLessThan(300);
        return (response.status === 204 ? null : await response.json()) as CapabilityOutput<Capabilities[Id]>;
    }
    return {
        ...transport,
        service,
        metadata,
        values,
        counts,
        invoke,
        failReads: () => {
            failReads = true;
        },
    };
}
