import { CmsObservability } from "@bernouy/cms-observability";
import type { JournalStore } from "@bernouy/cms-observability";
import { InMemoryJournalStore } from "@bernouy/cms-observability/memory";
import { compileProviderRoutes } from "@bernouy/cms-gateway/provider/server";
import { signProviderInvocationToken } from "@bernouy/cms-gateway/protocol";
import { BunRunner } from "@bernouy/http-runner";
import { serveForTest } from "@bernouy/http-runner/testing";
import { loadOfficialFeatures, registerOfficialFeatures } from "@bernouy/ulvia-provider/capabilities";
import { UlviaProvider, DefaultProviderCapabilityDispatcher } from "@bernouy/ulvia-provider";
import { providerOptions, PROVIDER_TOKEN } from "../../../ulviaProviderFixture";
export const contractId = "ulvia/cms.observability";
export function entry() {
    return {
        id: crypto.randomUUID(),
        time: new Date(Date.now() - 1000).toISOString(),
        level: "error",
        event: "page.render.failed",
        attributes: { password: "never-store-me", note: "x".repeat(1016) + " token=a" },
    };
}
interface Options {
    readonly instanceId?: string;
    readonly systemServiceId?: string | null;
    readonly headers?: HeadersInit;
}

export async function observabilityFixture(
    backing = new InMemoryJournalStore(),
    instanceId = "instance:observability-a",
) {
    const counts = { appends: 0, queries: 0, loaded: 0, limit: 0, gets: 0, aggregates: 0 };
    const store: JournalStore = {
        append: async (entries) => {
            counts.appends++;
            return backing.append(entries);
        },
        query: async (...args) => {
            counts.queries++;
            counts.limit = args[1].limit;
            const rows = await backing.query(...args);
            counts.loaded += rows.length;
            return rows;
        },
        get: async (...args) => {
            counts.gets++;
            return backing.get(...args);
        },
        aggregate: async (...args) => {
            counts.aggregates++;
            return backing.aggregate(...args);
        },
    };
    const journal = new CmsObservability({ store, instanceId, cursorKey: PROVIDER_TOKEN });
    const build = await loadOfficialFeatures();
    const contract = build.implementedContracts.find(({ release }) => release.contractId === contractId)!;
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    await registerOfficialFeatures(
        dispatcher,
        { observability: journal },
        build.implementations.filter((row) => row.contractId === contractId),
        { providerId: "ulvia/primary-provider", scope: { siteId: "default", instanceId } },
    );
    const runner = new BunRunner();
    new UlviaProvider(
        runner,
        providerOptions(
            [build.contracts.find(({ release }) => release.contractId === contractId)!],
            dispatcher,
            instanceId,
        ),
    );
    const server = serveForTest(runner);
    const routes = compileProviderRoutes([contract]);
    function call(capabilityId: string, input: unknown, options: Options = {}) {
        const binding = routes.find(({ capability }) => capability.id === capabilityId)!.capability.binding;
        if (binding.input?.body !== true) {
            throw new Error("The diagnostic test client requires a JSON body binding");
        }
        const requestId = crypto.randomUUID();
        const issuedAt = Math.floor(Date.now() / 1000);
        const service =
            options.systemServiceId === undefined
                ? capabilityId === "logs.append"
                    ? "cms-edge"
                    : undefined
                : options.systemServiceId;
        const token = signProviderInvocationToken(PROVIDER_TOKEN, {
            version: 1,
            requestId,
            instanceId: options.instanceId ?? instanceId,
            contractId,
            contractVersion: contract.release.version,
            capabilityId,
            ...(service ? { systemServiceId: service } : {}),
            issuedAt,
            expiresAt: issuedAt + 30,
        });
        return server.request(binding.method, binding.path, {
            headers: {
                authorization: `Bearer ${token}`,
                "x-ulvia-request-id": requestId,
                "content-type": "application/json",
                ...Object.fromEntries(new Headers(options.headers)),
            },
            body: JSON.stringify(input),
        });
    }
    return { call, journal, backing, counts, close: () => server.stop() };
}
