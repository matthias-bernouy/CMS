import { providerCredentialFingerprint } from "@bernouy/cms-gateway/access/providers";
import {
    DelegationAuthority,
    InMemoryDelegationStore,
    type DelegationActor,
} from "@bernouy/cms-gateway/access/delegation";
import { InMemoryReleaseCatalogue } from "@bernouy/cms-repository/contracts/catalogue";
import { InMemoryProviderManifestCatalogue } from "@bernouy/cms-repository/providers/catalogue";
import { planContractSelections } from "@bernouy/cms-repository/providers/selections";
import { gatewayRoute } from "../../fixtures";

export async function delegationFixture(
    options: {
        sourceEndpoint?: string;
        sourceBinary?: boolean;
        targetEndpoint?: string;
        sourceEffect?: "query" | "command";
        targetEffect?: "query" | "command";
        targetAccess?: string;
        sensitive?: boolean;
        policy?: Record<string, unknown>;
    } = {},
) {
    const behavior = (effect = "query", sensitive = false) => ({
        effect,
        execution: "sync",
        sensitive,
        ...(effect === "command" ? { idempotency: "natural" } : {}),
    });
    const source = await gatewayRoute({
        endpoint: options.sourceEndpoint,
        binary: options.sourceBinary,
        contractId: "origin",
        providerId: "origin.provider",
        installationId: "origin-install",
        behavior: behavior(options.sourceEffect),
        delegation: options.policy ?? {
            sources: ["item.list"],
            allow: [{ contractId: "*", capabilityId: "*", effect: "query", sensitive: false }],
        },
    });
    source.installation.installation.gatewayTokenRef = "${SOURCE_RETURN}";
    const target = await gatewayRoute({
        endpoint: options.targetEndpoint,
        contractId: "destination",
        providerId: "destination.provider",
        installationId: "target-install",
        behavior: behavior(options.targetEffect, options.sensitive),
        access: options.targetAccess ?? "public",
    });
    const releases = new InMemoryReleaseCatalogue();
    for (const route of [source, target]) {
        await releases.publish(route.release.admission);
    }
    const manifests = new InMemoryProviderManifestCatalogue(releases);
    for (const route of [source, target]) {
        await manifests.publish(route.manifest.admission);
    }
    const context = {
        releases,
        manifests,
        installations: [source, target].map((route) => route.installation.installation),
    };
    const state = {
        now: Date.now(),
        actor: { kind: "anonymous" } as DelegationActor,
        credential: providerCredentialFingerprint("credential-v1"),
        current: {
            siteId: "site-a",
            revision: 1,
            dependencyRevision: "state-1",
            grants: {
                default: "allow-selected" as const,
                denied: [] as { contractId: string; capabilityId: string }[],
            },
            plan: await planContractSelections("site-a", [source.selection, target.selection], context),
        },
    };
    const routes = {
        resolve: async (site: string, contract: string) =>
            site !== "site-a" ? null : contract === "origin" ? source : contract === "destination" ? target : null,
        isCurrent: async () => true,
    };
    const selections = { get: async () => state.current };
    const store = new InMemoryDelegationStore();
    const authority = new DelegationAuthority({
        siteId: "site-a",
        routes,
        selections,
        store,
        now: () => state.now,
        inspectActor: async () => state.actor,
        credentialFingerprint: async () => state.credential,
    });
    const root = () => ({
        siteId: "site-a",
        requestId: crypto.randomUUID(),
        installationId: source.selection.installationId,
        contractId: "origin",
        version: source.selection.version,
        digest: source.selection.digest,
        capabilityId: "item.list",
        actor: state.actor,
        deadline: state.now + 60_000,
    });
    const child = (ticket: string) => ({
        siteId: "site-a",
        ticket,
        sourceInstallationId: source.selection.installationId,
        sourceCredentialFingerprint: state.credential,
        contractId: "destination",
        capabilityId: "item.list",
    });
    return { authority, store, state, source, target, routes, selections, root, child, context };
}
