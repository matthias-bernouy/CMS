import { MongoAccountEmailConfigurationStore } from "@bernouy/auth/mongo";
import type { FormsV1Version, FormsMigrationSummary } from "@bernouy/forms/migration/mongo";
import { MongoSiteUpgradeStorage } from "@bernouy/repository/upgrades/mongo";
import { createHash } from "node:crypto";
import type { MongoClient } from "mongodb";
import { formsMigrationContracts, formsMigrationVersion, migrateFormsV1 } from "@bernouy/forms/migration/mongo";
import { ProviderExecutionSupport } from "../../runtime/instances/system/execution/support";
import { readInstalledExecution } from "../../runtime/instances/system/execution/installed";
import { systemUpgradePlan } from "../../runtime/instances/system/execution/upgradePlan";
import { MongoProviderInstanceRegistry } from "../../runtime/instances/MongoProviderInstanceRegistry";
import { instanceDatabaseName } from "../../runtime/stores/storageRoots";
import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { compareContractReleases } from "@bernouy/ulvia-contracts/compatibility";
import type { LoadedSystemArtifacts } from "../../runtime/instances/system/artifacts";
import { migrationStores } from "./stores";
import { previewSelection } from "./preview";
import { inspectConsumers } from "./usage";
export async function* formsMigrationInstances(mongo: MongoClient, artifacts: LoadedSystemArtifacts, endpoint: string) {
    const current = new ProviderExecutionSupport(),
        legacy = await formsMigrationContracts();
    // Metadata validation only: this support set is never used to mount an executor.
    const sourceSupport = new ProviderExecutionSupport({
        providerId: current.providerId,
        buildVersion: current.buildVersion,
        releases: [
            ...current.releases,
            ...legacy.map((row) => ({
                contractId: row.release.contractId,
                version: row.release.version,
                digest: row.digest,
            })),
        ],
    });
    if (
        await mongo
            .db()
            .collection("ulvia_provider_instance_transitions")
            .findOne({ status: { $ne: "succeeded" } }, { projection: { _id: 1 } })
    ) {
        throw new Error(
            "FORMS_MIGRATION_ACTIVE_TRANSITION:Finish instance transitions with the old image before upgrading",
        );
    }
    for await (const instance of new MongoProviderInstanceRegistry(mongo.db()).scan()) {
        if (!["ready", "disabled"].includes(instance.status)) {
            throw new Error(`FORMS_MIGRATION_INSTANCE_NOT_READY:${instance.id}`);
        }
        const db = mongo.db(instanceDatabaseName(instance.storageKey)),
            stores = migrationStores(db);
        if (await new MongoSiteUpgradeStorage(db).getActive("default")) {
            throw new Error(`FORMS_MIGRATION_SITE_TRANSITION:${instance.id}`);
        }
        const execution = await readInstalledExecution(instance, stores, sourceSupport, endpoint);
        const sourcePin = execution.plan.contracts.find(
            (pin) => pin.contractId === "ulvia/cms.forms" && pin.version.startsWith("1."),
        );
        if (!sourcePin) {
            continue;
        }
        const version: FormsV1Version = await formsMigrationVersion(sourcePin),
            target = systemUpgradePlan(execution.plan, artifacts);
        const installed = (await stores.installations.list("default")).find(
            (row) => row.installation.providerId === current.providerId && row.installation.accountId === instance.id,
        )!;
        const selected = await stores.selections.get("default");
        if (!selected) {
            throw new Error("FORMS_MIGRATION_SELECTIONS_MISSING");
        }
        for (const before of execution.plan.contracts) {
            if (before.contractId === "ulvia/cms.forms") {
                continue;
            }
            const next = artifacts.contracts.find((row) => row.release.contractId === before.contractId);
            const old = await stores.releases.get(before.contractId, before.version);
            if (!next || !old || !compareContractReleases(old.admission.release, next.release).consumerCompatible) {
                throw new Error(`FORMS_MIGRATION_CONTRACT_INCOMPATIBLE:${before.contractId}`);
            }
        }
        const preview = await previewSelection(
            stores,
            execution.plan,
            target,
            artifacts,
            selected,
            installed.installation,
        );
        const templates = preview.plan.selections.find((pin) => pin.contractId === "ulvia/cms.email-templates");
        if (
            !(await new MongoAccountEmailConfigurationStore(db).read()) &&
            templates?.installationId !== installed.installation.id
        ) {
            throw new Error("FORMS_MIGRATION_TEMPLATE_SOURCE_REQUIRED");
        }
        const consumers = await inspectConsumers(db, stores, selected, preview, installed.installation.id);
        const data: FormsMigrationSummary = await migrateFormsV1(db, version);
        yield {
            instance,
            db,
            stores,
            source: execution.plan,
            target,
            installed,
            selected,
            preview,
            version,
            data,
            consumers,
        };
    }
}
export async function formsMigrationPlan(mongo: MongoClient, artifacts: LoadedSystemArtifacts, endpoint: string) {
    const hash = createHash("sha256");
    let instances = 0,
        forms = 0,
        versions = 0,
        submissions = 0;
    for await (const row of formsMigrationInstances(mongo, artifacts, endpoint)) {
        hash.update(
            canonicalizeIJson(
                {
                    instance: row.instance,
                    source: row.source,
                    target: row.target,
                    installation: row.installed,
                    selected: row.selected,
                    data: row.data,
                    consumers: row.consumers,
                },
                64,
            ),
        );
        instances++;
        forms += row.data.forms;
        versions += row.data.versions;
        submissions += row.data.submissions;
    }
    return {
        schema: "ulvia.maintenance-plan/v1" as const,
        digest: hash.digest("hex"),
        instances,
        forms,
        versions,
        submissions,
        migrations: instances ? ["forms-v1-to-v2"] : [],
    };
}
