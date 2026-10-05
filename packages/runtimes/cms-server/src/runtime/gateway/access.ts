import type { LocalCredentialStore, Subject } from "@bernouy/cms-auth";
import type { CapabilityGatewayOptions } from "@bernouy/cms-gateway";
import type { Db } from "mongodb";

/** Initial host policy for the single-site runtime; wider grants need explicit site policy. */
export function createProductionGatewayAccess(credentials: LocalCredentialStore, administratorEmail: string, db: Db) {
    const grants = db.collection<{ sub: string }>("cms_administrator_grants");
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
        return subject.identifier === (await bootstrap()) || Boolean(await grants.findOne({ sub: subject.identifier }));
    };

    const administrators = {
        async canRevoke(sub: string): Promise<boolean> {
            return sub !== (await bootstrap());
        },
        async list(): Promise<string[]> {
            const rows = await grants.find({}, { projection: { sub: 1 } }).toArray();
            return [
                ...new Set(
                    [...rows.map((row) => row.sub), await bootstrap()].filter((id): id is string => Boolean(id)),
                ),
            ];
        },
        async set(sub: string, enabled: boolean): Promise<void> {
            if (sub === (await bootstrap()) && !enabled) {
                throw Object.assign(new Error("Bootstrap administrator cannot be removed"), { status: 409 });
            }
            if (enabled) {
                await grants.updateOne({ sub }, { $set: { sub } }, { upsert: true });
            } else {
                await grants.deleteOne({ sub });
            }
        },
    };

    return { authorize, isAdministrator, administrators };
}
