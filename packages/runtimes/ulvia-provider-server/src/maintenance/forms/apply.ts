import { publishContractSet } from "@bernouy/repository/contracts/catalogue";
import { importProviderManifest } from "@bernouy/repository/providers/sources";
import { migrateFormsV1, formsMigrationRetirement } from "@bernouy/forms/migration/mongo";
import { MongoTemplateStore } from "@bernouy/email-templates/mongo";
import { EmailTemplates } from "@bernouy/email-templates";
import { MongoAccountEmailConfigurationStore } from "@bernouy/auth/mongo";
import { MongoInitializationStateStore } from "@bernouy/repository/collections/mongo";
import { createHash } from "node:crypto";
import type { MongoClient } from "mongodb";
import type { LoadedSystemArtifacts } from "../../runtime/instances/system/artifacts";
import type { OfficialBootstrapSources } from "../../runtime/instances/system/bootstrap";
import { loadOfficialManifest } from "../../runtime/instances/system/artifacts";
import { initializeAccountTemplates } from "../../runtime/authentication/templates/initialize";
import { ProviderExecutionSupport } from "../../runtime/instances/system/execution/support";
import { formsMigrationInstances, formsMigrationPlan } from "./plan";
import { MongoProviderInstanceRegistry } from "../../runtime/instances/MongoProviderInstanceRegistry";
import type { ProviderManifestDigest } from "@bernouy/ulvia-providers";
export async function applyFormsMigration(
    mongo: MongoClient,
    artifacts: LoadedSystemArtifacts,
    bootstrap: OfficialBootstrapSources,
    endpoint: string,
    expected: string,
    exportSettings: (value: unknown) => Promise<void>,
) {
    const before = await formsMigrationPlan(mongo, artifacts, endpoint);
    if (before.digest !== expected) {
        throw new Error("FORMS_MIGRATION_PLAN_CHANGED");
    }
    const support = new ProviderExecutionSupport();
    for await (const row of formsMigrationInstances(mongo, artifacts, endpoint)) {
        const changed = await migrateFormsV1(row.db, row.version, true, (value) =>
            exportSettings({ instanceId: row.instance.id, ...(value as object) }),
        );
        if (changed.digest !== row.data.digest) {
            throw new Error("FORMS_MIGRATION_SOURCE_CHANGED");
        }
        const targetForms = artifacts.contracts.find((contract) => contract.release.contractId === "ulvia/cms.forms")!;
        const retirement = await formsMigrationRetirement(targetForms.release);
        await publishContractSet(row.stores.releases, [retirement.legacy, retirement.bridge]);
        await importProviderManifest(
            await loadOfficialManifest(bootstrap.providers, row.target),
            [bootstrap.providers],
            row.stores.releases,
            row.stores.manifests,
        );
        const old = row.installed.installation,
            now = new Date().toISOString();
        const report = {
            ...row.installed.observation!.report,
            buildVersion: support.buildVersion,
            manifest: { version: row.target.manifest.version, digest: row.target.manifest.digest },
            implementations: row.target.contracts.map((pin) => ({ ...pin, status: "ready" })),
        };
        const approved = await row.stores.installations.reapprove(
            { siteId: "default", installationId: old.id },
            row.installed.revision,
            {
                candidate: {
                    id: old.id,
                    siteId: old.siteId,
                    providerId: old.providerId,
                    accountId: old.accountId,
                    endpoint: old.endpoint,
                    manifestVersion: row.target.manifest.version,
                    manifestDigest: row.target.manifest.digest as ProviderManifestDigest,
                    providerTokenRef: old.providerTokenRef,
                    ...(old.gatewayTokenRef ? { gatewayTokenRef: old.gatewayTokenRef } : {}),
                    configuration: old.configuration,
                },
                report,
                preparedAt: now,
                approvedBy: "system:operator:forms-v1-to-v2",
            },
        );
        await row.stores.installations.recordObservation(
            { siteId: "default", installationId: old.id },
            approved.revision,
            report,
        );
        const selected = await row.stores.selections.replace(
            "default",
            row.preview.plan.selections,
            row.selected.revision,
            row.preview.grants,
        );
        const templates = selected.plan.selections.find((pin) => pin.contractId === "ulvia/cms.email-templates");
        const configuration = new MongoAccountEmailConfigurationStore(row.db);
        if (!(await configuration.read())) {
            if (templates?.installationId !== old.id) {
                throw new Error("FORMS_MIGRATION_TEMPLATE_SOURCE_REQUIRED");
            }
            const store = new MongoTemplateStore(row.db);
            await store.init();
            const source = createHash("sha256")
                .update(
                    JSON.stringify({
                        installationId: old.id,
                        endpoint: old.endpoint,
                        accountId: old.accountId,
                        instanceId: row.instance.id,
                    }),
                )
                .digest("hex");
            await initializeAccountTemplates(configuration, new EmailTemplates(store), source, () => undefined);
        }
        await new MongoInitializationStateStore(row.db).initialize("default");
        await new MongoProviderInstanceRegistry(mongo.db()).update(row.instance.id, row.instance.revision, {
            systemPlan: row.target,
        });
    }
    return before;
}
