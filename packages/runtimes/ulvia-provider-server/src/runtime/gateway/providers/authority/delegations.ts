import { providerCredentialFingerprint } from "@bernouy/cms-gateway/access/providers";
import { DelegationAuthority, type DelegationActor } from "@bernouy/cms-gateway/access/delegation";
import { MongoDelegationStore } from "@bernouy/cms-gateway/access/delegation/mongo";
import type { CapabilityGateway, GatewayRouteResolver } from "@bernouy/cms-gateway";
import type { ContractSelectionStore } from "@bernouy/cms-repository/providers/selections";
import type { Db } from "mongodb";

export async function createDelegationAuthority(options: {
    db: Db;
    siteId: string;
    routes: GatewayRouteResolver;
    selections: ContractSelectionStore;
    invoker(): CapabilityGateway;
    resolveSecret(reference: string): Promise<string | null | undefined>;
}) {
    const store = new MongoDelegationStore(options.db);
    await store.init();
    return new DelegationAuthority({
        ...options,
        store,
        credentialFingerprint: async (route) => {
            const reference = route.installation.installation.gatewayTokenRef;
            const token = reference ? await options.resolveSecret(reference) : null;
            return token ? providerCredentialFingerprint(token) : null;
        },
        inspectActor: async (actor): Promise<DelegationActor | null> => {
            if (actor.kind === "anonymous") {
                return { kind: "anonymous" };
            }
            const result = await options.invoker().invoke({
                siteId: options.siteId,
                contractId: "ulvia.cms.access",
                capabilityId: "inspect-actor",
                input: { subjectId: actor.subjectId },
                actor: { kind: "system", serviceId: "cms-gateway" },
            });
            if (result.kind !== "success" || !result.output || typeof result.output !== "object") {
                return null;
            }
            const current = result.output as Record<string, unknown>;
            if (
                current.state !== "authenticated" ||
                current.subjectId !== actor.subjectId ||
                typeof current.administrator !== "boolean" ||
                !Number.isSafeInteger(current.authorizationRevision)
            ) {
                return null;
            }
            return {
                kind: current.administrator ? "administrator" : "user",
                subjectId: actor.subjectId,
                authorizationRevision: Number(current.authorizationRevision),
            };
        },
    });
}
