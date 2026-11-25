import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { admitContractBundleJson } from "@bernouy/ulvia-contracts";
import { compileRetainedFeatures } from "@bernouy/ulvia-provider/build";
import { formsMigrationContracts } from "@bernouy/forms/migration/mongo";
import { publishContractSet } from "@bernouy/repository/contracts/catalogue";
import { admitProviderManifest } from "@bernouy/ulvia-providers";
import type { MongoClient } from "mongodb";
import { migrationStores } from "../../../../../src/maintenance/forms/stores";
import { MongoProviderInstanceRegistry } from "../../../../../src/runtime/instances/MongoProviderInstanceRegistry";
import { instanceDatabaseName } from "../../../../../src/runtime/stores/storageRoots";
import { loadSystemArtifacts } from "../../../../../src/runtime/instances/system/artifacts";
import { ProviderExecutionSupport } from "../../../../../src/runtime/instances/system/execution/support";
import { repositoryFixture } from "../../../official/fixture";

export async function migrationFixture(mongo: MongoClient, version: "1.0.0" | "1.1.0") {
    const bootstrap = await repositoryFixture();
    const artifacts = await loadSystemArtifacts(bootstrap.providers);
    const legacy = (await formsMigrationContracts()).find((item) => item.release.version === version)!;
    const registrySnapshot = (await compileRetainedFeatures())
        .flatMap((build) => build.contracts)
        .find((row) => row.release.contractId === "ulvia/repository" && row.release.version === "1.3.0")!;
    const previousRegistry = await admitContractBundleJson(
        registrySnapshot.canonicalJson,
        await Promise.all(
            (registrySnapshot.release.documentation ?? []).map(async (document) => ({
                id: `docs/${document.path}`,
                bytes: await readFile(join(import.meta.dir, "registry-1.3", document.path)),
            })),
        ),
    );
    const registry = new MongoProviderInstanceRegistry(mongo.db());
    await registry.init();
    const key = crypto.randomUUID().replaceAll("-", "");
    const db = mongo.db(instanceDatabaseName(key));
    const stores = migrationStores(db);
    await publishContractSet(stores.releases, [
        ...bootstrap.contracts.filter((row) => row.release.contractId !== "ulvia/cms.forms"),
        legacy,
        previousRegistry,
    ]);
    const old = await admitProviderManifest(
        {
            ...artifacts.manifest,
            version: "1.14.99",
            implementations: artifacts.manifest.implementations.map((pin) =>
                pin.contractId === "ulvia/cms.forms"
                    ? { ...pin, version, digest: legacy.digest }
                    : pin.contractId === "ulvia/repository"
                      ? { ...pin, version: previousRegistry.release.version, digest: previousRegistry.digest }
                      : pin,
            ),
        },
        stores.releases,
    );
    await stores.manifests.publish(old);
    await stores.installations.init();
    const endpoint = "http://ulvia-provider:5103";
    const id = `instance:${crypto.randomUUID()}`;
    const pins = old.manifest.implementations
        .filter(
            (pin) =>
                ![
                    "ulvia/cluster.logs",
                    "ulvia/provider.routing",
                    "ulvia/provider.tls",
                    "ulvia/cms.hosting",
                    "ulvia/repository",
                ].includes(pin.contractId),
        )
        .map(({ contractId, version, digest }) => ({ contractId, version, digest }));
    const instance = await registry.create({
        id,
        idempotencyKey: key,
        idempotencyFingerprint: key,
        creationAuthority: { kind: "operator" },
        storageKey: key,
        label: "Migration fixture",
        cmsUrl: "https://fixture.example",
        gatewayUrl: "https://fixture.example",
        repository: { url: "https://repo.ulvia.fr", configured: false },
        status: "ready",
        systemPlan: {
            manifest: { providerId: old.manifest.providerId, version: old.manifest.version, digest: old.digest },
            contracts: pins,
        },
    });
    const report = {
        protocol: "ulvia-provider/v1",
        providerId: old.manifest.providerId,
        instanceId: id,
        account: { id, label: instance.label },
        buildVersion: new ProviderExecutionSupport().buildVersion,
        manifest: { version: old.manifest.version, digest: old.digest },
        implementations: pins.map((pin) => ({ ...pin, status: "ready" })),
    };
    const approved = await stores.installations.approve({
        candidate: {
            id: "installation:native",
            siteId: "default",
            providerId: old.manifest.providerId,
            accountId: id,
            endpoint,
            manifestVersion: old.manifest.version,
            manifestDigest: old.digest,
            providerTokenRef: "${PROVIDER_TOKEN}",
            gatewayTokenRef: "${GATEWAY_TOKEN}",
            configuration: {},
        },
        report,
        preparedAt: new Date().toISOString(),
        approvedBy: "test:operator",
    });
    await stores.installations.recordObservation(
        { siteId: "default", installationId: approved.installation.id },
        approved.revision,
        report,
    );
    const selected = await stores.selections.replace(
        "default",
        pins.map((pin) => ({ ...pin, installationId: approved.installation.id, siteId: "default" })),
        0,
    );
    return { bootstrap, artifacts, registry, instance, db, stores, endpoint, selected, legacy, previousRegistry };
}
