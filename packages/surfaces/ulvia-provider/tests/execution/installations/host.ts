import type { InstallationServices } from "@bernouy/repository/features/installations";
import { spyOn } from "bun:test";
import {
    DefaultProviderCapabilityDispatcher,
    MemoryProviderOperationStore,
    ProviderOperationExecutor,
    registerOfficialProviderCapabilities,
} from "@bernouy/ulvia-provider";
import { loadOfficialFeatures } from "@bernouy/ulvia-provider/capabilities";
import { createProviderHandler } from "@bernouy/cms-gateway/provider/server";
import { signProviderInvocationToken, verifyProviderInvocationToken } from "@bernouy/cms-gateway/protocol";
import type { ProviderInvocationClaims } from "@bernouy/cms-gateway/protocol";
export const contractId = "ulvia/cms.installations";
export const digest = "sha256:" + "a".repeat(64);
export const reference = {
    repositoryId: "official",
    publisherId: "ulvia",
    collectionId: "ulvia/starter",
    version: "1.0.0",
    digest,
    approvedBrowserRiskDigest: digest,
};
const secret = "installations-sdk-host-" + "x".repeat(64);
export class HeldInstallationStore extends MemoryProviderOperationStore {
    held = true;
    receipts = 0;
    override async createOrGet(...args: Parameters<MemoryProviderOperationStore["createOrGet"]>) {
        this.receipts++;
        return super.createOrGet(...args);
    }
    override claim(...args: Parameters<MemoryProviderOperationStore["claim"]>) {
        return this.held ? Promise.resolve(false) : super.claim(...args);
    }
}
export type State = {
    calls: unknown[];
    failure?: unknown;
    administratorEnabled?: boolean;
    initializationStatus?: "pending" | "completed";
};
/** Real official assembly, receiver, signed tokens, host queue and stored read projections. */
export async function installationHost(store = new HeldInstallationStore(), state: State = { calls: [] }) {
    const build = await loadOfficialFeatures();
    const contract = build.implementedContracts.find(({ release }) => release.contractId === contractId)!;
    const claim = build.implementations.find((claim) => claim.contractId === contractId)!;
    const executor = new ProviderOperationExecutor(store, undefined, { contracts: [contract] });
    const workers = spyOn(executor, "register");
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    const intent = (kind: string) => ({
        id: digest,
        siteId: "site-a",
        kind,
        planDigest: digest,
        expectedRevision: 1,
        sourceStateDigest: digest,
        targetStateDigest: digest,
        status: "completed" as const,
        createdAt: "2026-11-08T12:00:00Z",
    });
    const execute =
        (name: string, kind: string) =>
        (...args: unknown[]) => {
            state.calls.push({ name, args });
            if (state.failure) {
                throw state.failure;
            }
            return Promise.resolve(intent(kind));
        };
    const unused = async (): Promise<never> => {
        throw new Error("Unexpected Installation service");
    };
    const initializationStatus = () => ({
        status: state.initializationStatus ?? "pending",
        revision: 1,
        completedPages: 0,
        totalPages: 0,
        planDigest: "",
        rootJson: "null",
        locale: "en",
        redirectPath: "",
    });
    await registerOfficialProviderCapabilities(
        dispatcher,
        {
            initialization: {
                siteId: "site-a",
                entry: async () => ({ pending: state.initializationStatus !== "completed" }),
                status: async () => initializationStatus(),
                list: async () => ({ items: [], cursor: "" }),
                plan: async (actorId: string) => {
                    state.calls.push({ name: "plan", actorId });
                    return { digest };
                },
                apply: async (actorId: string) => {
                    state.calls.push({ name: "initialize", actorId });
                    if (state.failure) {
                        throw state.failure;
                    }
                    state.initializationStatus = "completed";
                    return initializationStatus();
                },
            },
            repositorySettings: {
                siteId: "site-a",
                get: async () => ({
                    revision: 1,
                    url: "https://repo.ulvia.fr",
                    configured: false,
                    repositoryEnabled: false,
                    creationStatus: "none",
                    errorMessage: "",
                }),
                configure: async (
                    input: Parameters<NonNullable<InstallationServices["repositorySettings"]>["configure"]>[0],
                ) => {
                    state.calls.push({ name: "repository-configure", input });
                    return {
                        revision: 2,
                        url: input.url,
                        configured: true,
                        repositoryEnabled: false,
                        creationStatus: "none",
                        errorMessage: "",
                    };
                },
                create: async (input: { expectedRevision: number }, administratorId: string) => {
                    state.calls.push({ name: "repository-create", input, administratorId });
                    return {
                        revision: 2,
                        url: "https://site.example",
                        configured: true,
                        repositoryEnabled: true,
                        creationStatus: "succeeded",
                        errorMessage: "",
                    };
                },
            },
            collections: { snapshot: unused },
            collectionUpgrades: {
                apply: execute("apply-collection", "collection"),
                resume: execute("resume-collection", "collection"),
            },
            documentation: { get: unused, search: unused },
            repositoryDiscovery: { get: unused, search: unused },
        } as never,
        {
            siteId: "site-a",
            identities: {
                resolve: async (_scope: unknown, alias: string) =>
                    alias === "admin-a" ? "local:admin" : alias === "member-a" ? "local:member" : null,
            },
            administrators: {
                get: async (sub: string) => ({
                    enabled: state.administratorEnabled !== false && sub === "local:admin",
                }),
            },
            contractUpgrades: {
                apply: execute("apply-contract", "contracts"),
                resume: execute("resume-contract", "contracts"),
            },
        } as never,
        executor,
        { administration: { catalogue: unused } } as never,
        undefined,
        [claim],
        {
            providerId: "ulvia/primary-provider",
            scope: { siteId: "site-a", instanceId: "instance-a" },
            executeKeyed: async (_invocation, execute) => execute(),
        },
    );
    const receiver = createProviderHandler({
        contracts: [contract],
        dispatcher,
        authenticate: async (request) => {
            try {
                const claims = verifyProviderInvocationToken(
                    (request.headers.get("authorization") ?? "").slice(7),
                    secret,
                );
                if (
                    claims.instanceId !== "instance-a" ||
                    claims.contractId !== contractId ||
                    claims.contractVersion !== claim.version
                ) {
                    return null;
                }
                return { claims, siteId: "site-a", providerId: "ulvia/primary-provider" };
            } catch {
                return null;
            }
        },
        authorize: async (claims) =>
            claims.actorKind === "administrator" || claims.capabilityId === "initialization.entry",
    });
    const call = (
        capabilityId: string,
        input: unknown = {},
        options: { key?: string; language?: string; claims?: Partial<ProviderInvocationClaims> } = {},
    ) => {
        const capability = contract.capabilities.find(({ definition }) => definition.id === capabilityId)!.definition;
        const binding = capability.bindings.find((binding) => binding.transport === "http")!;
        const claims: ProviderInvocationClaims = {
            version: 1,
            requestId: crypto.randomUUID(),
            instanceId: "instance-a",
            contractId,
            contractVersion: claim.version,
            capabilityId,
            actorKind: "administrator",
            subjectId: "admin-a",
            issuedAt: Math.floor(Date.now() / 1000),
            expiresAt: Math.floor(Date.now() / 1000) + 30,
            ...options.claims,
        };
        for (const [key, value] of Object.entries(claims)) {
            if (value === undefined) {
                Reflect.deleteProperty(claims, key);
            }
        }
        return receiver(
            new Request("https://provider.test" + binding.path, {
                method: binding.method,
                headers: {
                    authorization: `Bearer ${signProviderInvocationToken(secret, claims)}`,
                    "x-ulvia-request-id": claims.requestId,
                    "content-type": "application/json",
                    ...(capability.behavior.effect === "command" && capability.behavior.idempotency === "keyed"
                        ? { "idempotency-key": options.key ?? "same-key" }
                        : {}),
                    "accept-language": options.language ?? "en",
                },
                ...(binding.method === "GET" ? {} : { body: JSON.stringify(input) }),
            }),
        );
    };
    return { store, state, executor, workers, dispatcher, call, claim };
}
