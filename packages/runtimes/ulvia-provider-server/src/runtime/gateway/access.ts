import type { Subject } from "@bernouy/cms-auth";
import type { CapabilityGatewayOptions } from "@bernouy/cms-gateway";
import { MongoAdministratorGrantStore } from "@bernouy/cms-gateway/access/mongo";
import { satisfiesVersionRange } from "@bernouy/cms-repository/providers";
import type { ProviderManifestCatalogue } from "@bernouy/cms-repository/providers/catalogue";
import type { ProviderInstallationStore } from "@bernouy/cms-repository/providers/installations";
import type { Db } from "mongodb";

type ProviderCapabilityGrant = {
    sourceInstallationId: string;
    targetInstallationId: string;
    contractId: string;
    capabilityId: string;
    enabled: boolean;
    maxCallsPerMinute?: number;
    updatedAt: Date;
};

export function createProviderGatewayAccess(
    db: Db,
    siteId: string,
    installations: ProviderInstallationStore,
    manifests: ProviderManifestCatalogue,
) {
    const administrators = new MongoAdministratorGrantStore(db);
    const grants = db.collection<ProviderCapabilityGrant>("cms_provider_capability_grants");
    const usage = db.collection<{ _id: string; count: number; expiresAt: Date }>("cms_provider_capability_usage");
    const providerMayCall = async (
        installationId: string,
        targetVersion: string,
        capabilityId: string,
        contractId: string,
        targetInstallationId: string,
    ): Promise<boolean> => {
        const source = await installations.get({ siteId, installationId });
        if (!source || source.installation.status !== "enabled") {
            return false;
        }
        const manifest = await manifests.get(
            source.installation.providerId,
            source.installation.approval.manifestVersion,
        );
        const declared = manifest?.admission.manifest.implementations.some((implementation) =>
            implementation.requires.some(
                (requirement) =>
                    requirement.contractId === contractId &&
                    requirement.capabilityId === capabilityId &&
                    satisfiesVersionRange(targetVersion, requirement.versionRange),
            ),
        );
        if (!declared || manifest!.admission.digest !== source.installation.approval.manifestDigest) {
            return false;
        }
        const grant = await grants.findOne({
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
        const counter = await usage.findOneAndUpdate(
            { _id: key },
            { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date((minute + 2) * 60_000) } },
            { upsert: true, returnDocument: "after" },
        );
        return Number(counter?.count) <= grant.maxCallsPerMinute;
    };
    const isAdministratorId = async (subjectId: string) => (await administrators.get(subjectId)).enabled;
    const authorize: CapabilityGatewayOptions["authorize"] = async (actor, capability, route) =>
        (actor.kind === "provider" &&
            (await providerMayCall(
                actor.installationId,
                route.selection.version,
                capability.id,
                route.selection.contractId,
                route.installation.installation.id,
            ))) ||
        (actor.kind === "anonymous" && capability.access === "public") ||
        ((actor.kind === "user" || actor.kind === "administrator") &&
            (capability.access === "public" || capability.access === "authenticated")) ||
        (actor.kind === "administrator" && capability.access === "admin" && (await isAdministratorId(actor.subjectId)));
    return {
        authorize,
        isAdministrator: async (subject: Subject) => isAdministratorId(subject.identifier),
        administrators,
    };
}
