import type { Subject } from "@bernouy/cms-auth";
import type { CapabilityGatewayOptions } from "@bernouy/cms-gateway";
import { MongoAdministratorGrantStore } from "@bernouy/cms-gateway/execution/mongo";
import type { Db } from "mongodb";
import { satisfiesVersionRange } from "@bernouy/cms-repository/providers";
import type { ProviderInstallationStore } from "@bernouy/cms-repository/providers/installations";
import type { ProviderManifestCatalogue } from "@bernouy/cms-repository/providers/catalogue";

type ProviderCapabilityGrant = {
    sourceInstallationId: string;
    targetInstallationId: string;
    contractId: string;
    capabilityId: string;
    enabled: boolean;
    maxCallsPerMinute?: number;
    updatedAt: Date;
};

/** Initial host policy for the single-site runtime; wider grants need explicit site policy. */
export function createProductionGatewayAccess(
    db: Db,
    siteId = "default",
    installations?: ProviderInstallationStore,
    manifests?: ProviderManifestCatalogue,
) {
    const administrators = new MongoAdministratorGrantStore(db);
    const providerGrants = db.collection<ProviderCapabilityGrant>("cms_provider_capability_grants");
    const providerUsage = db.collection<{ _id: string; count: number; expiresAt: Date }>(
        "cms_provider_capability_usage",
    );
    const providerMayCall = async (
        installationId: string,
        targetVersion: string,
        capabilityId: string,
        contractId: string,
        targetInstallationId: string,
    ): Promise<boolean> => {
        if (!installations || !manifests) {
            return false;
        }
        const source = await installations.get({ siteId, installationId });
        if (!source || source.installation.status !== "enabled") {
            return false;
        }
        const manifest = await manifests.get(
            source.installation.providerId,
            source.installation.approval.manifestVersion,
        );
        if (!manifest || manifest.admission.digest !== source.installation.approval.manifestDigest) {
            return false;
        }
        const declared = manifest.admission.manifest.implementations.some((implementation) =>
            implementation.requires.some(
                (requirement) =>
                    requirement.contractId === contractId &&
                    requirement.capabilityId === capabilityId &&
                    satisfiesVersionRange(targetVersion, requirement.versionRange),
            ),
        );
        if (!declared) {
            return false;
        }
        const grant = await providerGrants.findOne({
            sourceInstallationId: installationId,
            targetInstallationId,
            contractId,
            capabilityId,
            enabled: true,
        });
        if (!grant) {
            return false;
        }
        if (!grant.maxCallsPerMinute) {
            return true;
        }
        const minute = Math.floor(Date.now() / 60_000);
        const key = `${siteId}\0${installationId}\0${contractId}\0${capabilityId}\0${minute}`;
        const usage = await providerUsage.findOneAndUpdate(
            { _id: key },
            { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date((minute + 2) * 60_000) } },
            { upsert: true, returnDocument: "after" },
        );
        return Number(usage?.count) <= grant.maxCallsPerMinute;
    };

    const isAdministratorId = async (subjectId: string): Promise<boolean> => {
        return (await administrators.get(subjectId)).enabled;
    };
    const isAdministrator = async (subject: Subject): Promise<boolean> => isAdministratorId(subject.identifier);
    const authorize: CapabilityGatewayOptions["authorize"] = async (actor, capability, route, origin) =>
        (origin === "provider" &&
            actor.kind === "provider" &&
            (await providerMayCall(
                actor.installationId,
                route.selection.version,
                capability.id,
                route.selection.contractId,
                route.installation.installation.id,
            ))) ||
        (origin === "page" &&
            (capability.access === "public" ||
                (capability.access === "authenticated" && (actor.kind === "user" || actor.kind === "administrator")) ||
                (capability.access === "admin" &&
                    actor.kind === "administrator" &&
                    (await isAdministratorId(actor.subjectId)))));

    return {
        authorize,
        isAdministrator,
        administrators,
        providerGrants: {
            async set(value: Omit<ProviderCapabilityGrant, "updatedAt">) {
                await providerGrants.replaceOne(
                    {
                        sourceInstallationId: value.sourceInstallationId,
                        targetInstallationId: value.targetInstallationId,
                        contractId: value.contractId,
                        capabilityId: value.capabilityId,
                    },
                    { ...value, updatedAt: new Date() },
                    { upsert: true },
                );
            },
            list(sourceInstallationId: string) {
                return providerGrants.find({ sourceInstallationId }).toArray();
            },
        },
    };
}
