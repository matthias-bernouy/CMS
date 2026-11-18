import { secretKeyToRef } from "@bernouy/secret-store";
import { runRecoveryWorker } from "../../recovery/worker";
import { metadataFixtureScope } from "./scope";
import { assertCondition, requireRecord } from "../../../queries/types";
import { ClientFailure } from "../../../../harness/clients/failure";
import type { FreshTenant } from "../../fresh";
import type { QueryEnvironment } from "../../../queries/execute";
import type { CatalogueProvider } from "../resources/provider";

export type FixtureConnection = Readonly<{
    id: string;
    providerId: string;
    accountId: string;
    instanceId: string;
    revision: number;
    status: "enabled" | "disabled";
    manifestVersion: string;
    observedAt: string;
}>;
export type ConnectionWrite = Readonly<{
    resource: CatalogueProvider;
    id: string;
    accountId: string;
    instanceId: string;
}>;

export function metadataConnectionSecretRef(id: string): string {
    assertCondition(/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(id), "metadata-fixture-connection-id");
    return secretKeyToRef(`PERFORMANCE_METADATA_${id.replaceAll("-", "").toUpperCase()}`);
}

/** Seed through the real validated installation lifecycle and Mongo adapter, never by inserting handwritten documents. */
export async function seedCatalogueConnections(
    environment: QueryEnvironment,
    tenant: FreshTenant,
    writes: readonly ConnectionWrite[],
): Promise<FixtureConnection[]> {
    metadataFixtureScope(environment.stack, tenant.site, environment.main.origin);
    assertCondition(writes.length > 0 && writes.length <= 64, "metadata-fixture-connection-count-bound");
    const payload = JSON.stringify(
        writes.map(({ resource, ...identity }) => ({
            ...identity,
            providerTokenRef: metadataConnectionSecretRef(identity.id),
            providerId: resource.id,
            version: resource.version,
            digest: resource.digest,
        })),
    );
    assertCondition(Buffer.byteLength(payload) < 32 * 1024, "metadata-fixture-seed-payload-bound");
    const program = `
        import { MongoClient } from "mongodb";
        import { MongoReleaseCatalogue } from "@bernouy/repository/contracts/mongo";
        import { MongoProviderManifestCatalogue, MongoProviderInstallationStore } from "@bernouy/repository/providers/mongo";
        import { ProviderInstallationLifecycle } from "@bernouy/repository/providers/installations";
        import { MongoProviderInstanceRegistry } from "/app/packages/runtimes/ulvia-provider-server/src/runtime/instances/MongoProviderInstanceRegistry";
        import { instanceDatabaseName } from "/app/packages/runtimes/ulvia-provider-server/src/runtime/stores/storageRoots";
        const client = new MongoClient(process.env.MONGO_URL);
        let phase = "connect";
        let processed = 0;
        try {
            await client.connect();
            phase = "instance";
            const record = await new MongoProviderInstanceRegistry(client.db()).get(${JSON.stringify(tenant.site.instanceId)});
            if (!record || record.status !== "ready" || record.cmsUrl !== ${JSON.stringify(tenant.site.url)}) {
                throw Error("Metadata fixture instance mismatch");
            }
            phase = "stores";
            const db = client.db(instanceDatabaseName(record.storageKey));
            const releases = new MongoReleaseCatalogue(db);
            const manifests = new MongoProviderManifestCatalogue(db, releases);
            const clock = () => new Date().toISOString();
            const store = new MongoProviderInstallationStore(db, manifests, clock);
            await store.init();
            const workflow = new ProviderInstallationLifecycle(store, manifests, clock);
            const saved = new Map();
            for (const item of ${payload}) {
                phase = "manifest";
                const pin = await manifests.get(item.providerId, item.version);
                if (!pin || pin.admission.digest !== item.digest) {
                    throw Error("Metadata fixture manifest mismatch");
                }
                const report = { protocol: "ulvia-provider/v1", providerId: item.providerId, instanceId: item.instanceId, account: { id: item.accountId, label: "Controlled metadata fixture" }, buildVersion: "1.0.0", manifest: { version: item.version, digest: item.digest }, implementations: pin.admission.manifest.implementations.map(({ contractId, version, digest }) => ({ contractId, version, digest, status: "ready" })) };
                const scope = { siteId: "default", installationId: item.id };
                phase = "current";
                const current = await store.get(scope);
                let result;
                if (current) {
                    if (current.installation.providerId !== item.providerId || current.installation.accountId !== item.accountId) {
                        throw Error("Metadata fixture immutable identity mismatch");
                    }
                    phase = "prepare-modification";
                    const prepared = await workflow.prepareModification(scope, current.revision, { manifestVersion: item.version, manifestDigest: item.digest }, report);
                    phase = "modify";
                    result = await workflow.modify(prepared, ${JSON.stringify(tenant.session.subjectId)});
                } else {
                    phase = "prepare-approval";
                    const prepared = await workflow.prepare({ id: item.id, siteId: "default", providerId: item.providerId, accountId: item.accountId, endpoint: "http://ulvia-provider:5103", manifestVersion: item.version, manifestDigest: item.digest, providerTokenRef: item.providerTokenRef, configuration: {} }, report);
                    phase = "approve";
                    result = await workflow.approve(prepared, ${JSON.stringify(tenant.session.subjectId)});
                }
                phase = "observe";
                result = await workflow.observe(scope, result.revision, report);
                processed++;
                saved.set(item.id, { id: item.id, providerId: item.providerId, accountId: item.accountId, instanceId: item.instanceId, status: result.installation.status, revision: result.revision, manifestVersion: result.installation.approval.manifestVersion, observedAt: result.observation.observedAt });
            }
            console.log(JSON.stringify([...saved.values()]));
        } catch (error) {
            const code = typeof error?.code === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(error.code) ? error.code : "internal";
            console.log(JSON.stringify({ failure: { phase, code, processed } }));
        } finally { await client.close(); }
    `;
    return decodeMetadataSeed(JSON.parse((await runRecoveryWorker(environment.stack, program)).trim()), writes);
}

/** A successful child process can carry a refused domain transition; it never becomes accepted fixture data. */
export function decodeMetadataSeed(value: unknown, writes: readonly ConnectionWrite[]): FixtureConnection[] {
    if (!Array.isArray(value)) {
        const failure = requireRecord(requireRecord(value).failure);
        const safe = (item: unknown) =>
            typeof item === "string" && /^[a-zA-Z0-9_-]{1,64}$/u.test(item) ? item : "internal";
        throw new ClientFailure(`metadata-fixture-worker-${safe(failure.phase)}-${safe(failure.code)}`);
    }
    const rows = value as FixtureConnection[];
    assertCondition(rows.length === new Set(writes.map((row) => row.id)).size, "metadata-fixture-seed-count");
    for (const row of rows) {
        assertCondition(
            writes.some(
                (item) => item.id === row.id && item.resource.id === row.providerId && item.accountId === row.accountId,
            ) &&
                Number.isSafeInteger(row.revision) &&
                row.revision >= 1 &&
                Number.isFinite(Date.parse(row.observedAt)),
            "metadata-fixture-seed-identity",
        );
    }
    return rows;
}
