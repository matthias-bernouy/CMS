import { encryptAesGcm, decryptAesGcm } from "@bernouy/envelope-crypto";
import type { EventDefinition, EventServices } from "@bernouy/cms-events";
import type { ProviderCapabilityInvocationContext } from "@bernouy/cms-gateway/provider/server";
import { eventInitiators } from "../../../../../src/runtime/recovery/events/origins";
export const definition: EventDefinition = {
    id: "a".repeat(64),
    owner: { siteId: "default", installationId: "forms", namespace: "ulvia/cms.forms" },
    declaringContract: { contractId: "ulvia/cms.forms", version: "1.1.0", digest: `sha256:${"b".repeat(64)}` },
    eventType: "submission.created",
    version: "1.1.0",
    digest: `sha256:${"b".repeat(64)}`,
    schema: { type: "boolean" },
    sensitive: false,
    retired: false,
    createdAt: new Date(0).toISOString(),
};
export const context: ProviderCapabilityInvocationContext = {
    siteId: "default",
    providerId: "native",
    connectionId: "forms",
    requestId: crypto.randomUUID(),
    contractVersion: "1.1.0",
    invocation: { instanceId: "tenant", contractId: "ulvia/cms.forms" },
};
export function originFixture(instanceId = "tenant", key = Buffer.alloc(32, 1)) {
    let administrator = true;
    let current = true;
    let reads = 0;
    const aliases: string[] = [];
    const services = {
        authority: { assertSource: async () => {}, ancestry: async () => [] },
    } as unknown as EventServices;
    const options = {
        instanceId,
        providerId: "native",
        stores: {
            fieldCrypto: {
                encrypt: async (text: string) => encryptAesGcm(text, key),
                decrypt: async (blob: Parameters<typeof decryptAesGcm>[0]) => decryptAesGcm(blob, key).toString("utf8"),
            },
            runtimeSessionSecret: "instance-secret",
            db: {
                collection: () => ({
                    findOne: async () => {
                        reads++;
                        return parent;
                    },
                }),
            },
        },
        gateway: {
            siteId: "default",
            identities: {
                resolve: async (_: unknown, id: string) =>
                    id === "verified-native-alias" ? "private-cms-subject" : null,
                getOrCreate: async (scope: { providerId: string }, id: string) => {
                    aliases.push(id);
                    return `${scope.providerId}-alias`;
                },
            },
            routes: {
                resolve: async (_: string, contractId: string) => ({
                    selection: { installationId: contractId === "ulvia/cms.forms" ? "forms" : "commerce" },
                    installation: {
                        installation: { providerId: contractId === "ulvia/cms.forms" ? "native" : "remote-commerce" },
                    },
                }),
                isCurrent: async () => current,
            },
        },
        administrator: async () => {
            if (!administrator) {
                throw new Error("Administrator revoked");
            }
            return "admin";
        },
        services: () => services,
    };
    let parent: unknown = null;
    const create = () => eventInitiators(options as unknown as Parameters<typeof eventInitiators>[0]);
    return {
        api: create(),
        reopen: create,
        aliases,
        reads: () => reads,
        parent: (value: unknown) => {
            parent = value;
        },
        revoke: () => {
            administrator = false;
        },
        stale: () => {
            current = false;
        },
    };
}
