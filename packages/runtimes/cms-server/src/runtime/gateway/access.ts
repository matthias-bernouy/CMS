import type { LocalCredentialStore, Subject } from "@bernouy/cms-auth";
import type { CapabilityGatewayOptions } from "@bernouy/cms-gateway";

/** Initial host policy for the single-site runtime; wider grants need explicit site policy. */
export function createProductionGatewayAccess(credentials: LocalCredentialStore, administratorEmail: string) {
    const authorize: CapabilityGatewayOptions["authorize"] = async (actor, capability, _route, origin) =>
        (origin === "delivery" && capability.access === "public") ||
        (origin === "control" && actor.kind === "administrator");

    const isAdministrator = async (subject: Subject): Promise<boolean> => {
        const credential = await credentials.getByEmail(administratorEmail);
        return credential !== null && subject.identifier === `local:${credential.sub}`;
    };

    return { authorize, isAdministrator };
}
