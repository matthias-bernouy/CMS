import type { Subject } from "@bernouy/cms-auth";
import type { ContractSelectionStore } from "@bernouy/cms-repository/providers/selections";
import type { GatewayRouteResolver } from "@bernouy/cms-gateway";
import type { CapabilityGatewayOptions } from "@bernouy/cms-gateway";
import { MongoAdministratorGrantStore } from "@bernouy/cms-gateway/access/mongo";
import { ProviderAccess } from "@bernouy/cms-gateway/access/providers";
import { MongoProviderAccessStore } from "@bernouy/cms-gateway/access/providers/mongo";
import type { ProviderManifestCatalogue } from "@bernouy/cms-repository/providers/catalogue";
import type { ProviderInstallationStore } from "@bernouy/cms-repository/providers/installations";
import type { Db } from "mongodb";

export async function createProviderGatewayAccess(
    db: Db,
    siteId: string,
    installations: ProviderInstallationStore,
    manifests: ProviderManifestCatalogue,
    selections: ContractSelectionStore,
    routes: GatewayRouteResolver,
    resolveSecret: (reference: string) => Promise<string | null | undefined>,
) {
    const administrators = new MongoAdministratorGrantStore(db);
    const accessStore = new MongoProviderAccessStore(db);
    await accessStore.init();
    const providers = new ProviderAccess({
        siteId,
        installations,
        manifests,
        store: accessStore,
        selections,
        routes,
        resolveSecret,
    });
    const isAdministratorId = async (subjectId: string) => (await administrators.get(subjectId)).enabled;
    const authorize: CapabilityGatewayOptions["authorize"] = async (actor, capability, route) =>
        (actor.kind === "system" &&
            actor.serviceId === "cms-gateway" &&
            route.selection.contractId === "ulvia.cms.access" &&
            capability.id === "inspect-actor") ||
        (actor.kind === "system" &&
            actor.serviceId === "ulvia-provider" &&
            route.selection.contractId === "ulvia.cms.observability" &&
            capability.id === "logs.append") ||
        (actor.kind === "provider" &&
            (await providers.authorize({
                sourceInstallationId: actor.installationId,
                sourceCredentialFingerprint: actor.credentialFingerprint,
                targetInstallationId: route.installation.installation.id,
                contractId: route.requestedRelease.admission.release.contractId,
                capabilityId: capability.id,
                version: route.requestedRelease.admission.release.version,
            }))) ||
        (actor.kind === "anonymous" && capability.access === "public") ||
        ((actor.kind === "user" || actor.kind === "administrator") &&
            (capability.access === "public" || capability.access === "authenticated")) ||
        (actor.kind === "administrator" && capability.access === "admin" && (await isAdministratorId(actor.subjectId)));
    return {
        authorize,
        providers,
        isAdministrator: async (subject: Subject) => isAdministratorId(subject.identifier),
        administrators,
    };
}
