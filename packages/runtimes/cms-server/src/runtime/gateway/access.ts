import type { LocalCredentialStore, Subject } from "@bernouy/cms-auth";
import type { CapabilityGatewayOptions } from "@bernouy/cms-gateway";
import type { Db } from "mongodb";

type AdministratorGrant = {
    sub: string;
    enabled?: boolean;
    revision?: number;
    createdAt?: Date;
    updatedAt?: Date;
};

/** Initial host policy for the single-site runtime; wider grants need explicit site policy. */
export function createProductionGatewayAccess(credentials: LocalCredentialStore, administratorEmail: string, db: Db) {
    const grants = db.collection<AdministratorGrant>("cms_administrator_grants");
    const bootstrap = async () => {
        const credential = await credentials.getByEmail(administratorEmail);
        return credential ? `local:${credential.sub}` : null;
    };
    const authorize: CapabilityGatewayOptions["authorize"] = async (actor, capability, _route, origin) =>
        (origin === "delivery" &&
            (capability.access === "public" ||
                (capability.access === "authenticated" &&
                    (actor.kind === "user" || actor.kind === "administrator")))) ||
        (origin === "page" && (actor.kind === "user" || actor.kind === "administrator")) ||
        (origin === "control" && actor.kind === "administrator");

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

    return { authorize, isAdministrator, administrators };
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
