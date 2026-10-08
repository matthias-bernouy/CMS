import type { LocalCredentialStore, Subject } from "@bernouy/cms-auth";
import type { CapabilityGatewayOptions } from "@bernouy/cms-gateway";
import type { Db } from "mongodb";
import { satisfiesVersionRange } from "@bernouy/cms-repository/providers";
import type { ProviderInstallationStore } from "@bernouy/cms-repository/providers/installations";
import type { ProviderManifestCatalogue } from "@bernouy/cms-repository/providers/catalogue";

type AdministratorGrant = {
    sub: string;
    enabled?: boolean;
    revision?: number;
    createdAt?: Date;
    updatedAt?: Date;
};

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
    credentials: LocalCredentialStore,
    administratorEmail: string,
    db: Db,
    siteId: string,
    installations: ProviderInstallationStore,
    manifests: ProviderManifestCatalogue,
) {
    const grants = db.collection<AdministratorGrant>("cms_administrator_grants");
    const providerGrants = db.collection<ProviderCapabilityGrant>("cms_provider_capability_grants");
    const providerUsage = db.collection<{ _id: string; count: number; expiresAt: Date }>(
        "cms_provider_capability_usage",
    );
    const bootstrap = async () => {
        const credential = await credentials.getByEmail(administratorEmail);
        return credential ? `local:${credential.sub}` : null;
    };
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
        (origin === "delivery" &&
            (capability.access === "public" ||
                (capability.access === "authenticated" &&
                    (actor.kind === "user" || actor.kind === "administrator")))) ||
        (origin === "page" && (actor.kind === "user" || actor.kind === "administrator")) ||
        (origin === "control" && actor.kind === "administrator");

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

    const isAdministrator = async (subject: Subject): Promise<boolean> => {
        return (
            subject.identifier === (await bootstrap()) ||
            Boolean(await grants.findOne({ sub: subject.identifier, enabled: { $ne: false } }))
        );
    };

    const administrators = {
        async canRevoke(sub: string): Promise<boolean> {
            return sub !== (await bootstrap());
        },
        async get(sub: string) {
            if (sub === (await bootstrap())) {
                return { sub, enabled: true, revision: 1, bootstrap: true };
            }
            const row = await grants.findOne({ sub });
            return {
                sub,
                enabled: row ? row.enabled !== false : false,
                revision: row?.revision ?? (row ? 1 : 0),
                bootstrap: false,
            };
        },
        async list(): Promise<string[]> {
            const rows = await grants.find({ enabled: { $ne: false } }, { projection: { sub: 1 } }).toArray();
            return [
                ...new Set(
                    [...rows.map((row) => row.sub), await bootstrap()].filter((id): id is string => Boolean(id)),
                ),
            ];
        },
        async set(sub: string, enabled: boolean, expectedRevision?: number) {
            const current = await this.get(sub);
            if (current.bootstrap && !enabled) {
                throw Object.assign(new Error("Bootstrap administrator cannot be removed"), { status: 409 });
            }
            if (expectedRevision !== undefined && current.revision !== expectedRevision) {
                throw revisionConflict();
            }
            if (current.enabled === enabled) {
                return current;
            }
            const now = new Date();
            if (current.revision === 0) {
                if (!enabled) {
                    return current;
                }
                try {
                    await grants.insertOne({ sub, enabled: true, revision: 1, createdAt: now, updatedAt: now });
                } catch (error) {
                    if (isDuplicateKey(error)) {
                        throw revisionConflict();
                    }
                    throw error;
                }
                return { sub, enabled: true, revision: 1, bootstrap: false };
            }
            const result = await grants.findOneAndUpdate(
                grantRevisionFilter(sub, current.revision),
                { $set: { enabled, revision: current.revision + 1, updatedAt: now } },
                { returnDocument: "after" },
            );
            if (!result) {
                throw revisionConflict();
            }
            return { sub, enabled, revision: result.revision!, bootstrap: false };
        },
    };

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

function grantRevisionFilter(sub: string, revision: number) {
    return revision === 1 ? { sub, $or: [{ revision: 1 }, { revision: { $exists: false } }] } : { sub, revision };
}

function revisionConflict(): Error & { status: number } {
    return Object.assign(new Error("administrator grant revision conflict"), { status: 409 });
}

function isDuplicateKey(error: unknown): boolean {
    return Boolean(error && typeof error === "object" && (error as { code?: number }).code === 11000);
}
