import { CapabilityGateway, type GatewayRoute } from "@bernouy/cms-gateway";
import { HttpGatewayTransport } from "@bernouy/cms-gateway/http";
import { NodeGatewayHttpNetwork } from "@bernouy/cms-gateway/http/node";
import { verifyProviderInvocationToken } from "@bernouy/cms-gateway/protocol";
import { BunRunner } from "@bernouy/http-runner";
import { serveForTest } from "@bernouy/http-runner/testing";
import type { AdmittedContractRelease } from "@bernouy/cms-repository/contracts";
import {
    DefaultProviderCapabilityDispatcher,
    UlviaProvider,
    type UlviaProviderInstanceRuntime,
} from "@bernouy/ulvia-provider";
import type { KernelInstanceApi } from "@bernouy/ulvia-provider/kernel";
import {
    NETWORK_INSTANCE_ID,
    NETWORK_SITE_ID,
    NETWORK_TOKEN,
    performanceContract,
    performanceRoute,
    runtimeReport,
} from "./networkTransportContract";

export async function createNetworkJourney() {
    const admission = await performanceContract();
    let providerDelayMs = 0;
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    dispatcher.register(admission.release.contractId, "echo", async (input) => {
        if (providerDelayMs) {
            await Bun.sleep(providerDelayMs);
        }
        return { value: input.value };
    });
    const providerRunner = new BunRunner({ hostname: "127.0.0.1" });
    new UlviaProvider(providerRunner, providerOptions(admission, dispatcher));
    const providerServer = serveForTest(providerRunner);
    let kernelServer: ReturnType<typeof serveForTest> | undefined;
    try {
        const endpoint = providerServer.url.replace("localhost", "127.0.0.1");
        const route = await performanceRoute(admission, endpoint);
        const gateway = new CapabilityGateway({
            routes: {
                resolve: async () => route,
                isCurrent: async (candidate: GatewayRoute) => candidate === route,
            },
            transport: new HttpGatewayTransport({
                network: new NodeGatewayHttpNetwork({ resolveToken: async () => NETWORK_TOKEN }),
            }),
            authorize: async () => true,
            now: () => "2026-10-15T12:00:00.000Z",
        });
        const kernelRunner = new BunRunner({ hostname: "127.0.0.1" });
        kernelRunner.post("/benchmark/call", async (request) => {
            const { value } = (await request.json()) as { value: string };
            const result = await gateway.invoke({
                siteId: NETWORK_SITE_ID,
                contractId: admission.release.contractId,
                capabilityId: "echo",
                input: { value },
                origin: "system",
                actor: { kind: "system", serviceId: "performance-suite" },
            });
            return Response.json(result);
        });
        kernelServer = serveForTest(kernelRunner);
        return {
            kernelUrl: kernelServer.url.replace("localhost", "127.0.0.1"),
            setDelay: (delayMs: number) => {
                providerDelayMs = delayMs;
            },
            stop: () => {
                kernelServer?.stop();
                providerServer.stop();
            },
        };
    } catch (error) {
        kernelServer?.stop();
        providerServer.stop();
        throw error;
    }
}

function providerOptions(admission: AdmittedContractRelease, dispatcher: DefaultProviderCapabilityDispatcher) {
    const runtime: UlviaProviderInstanceRuntime = {
        siteId: NETWORK_SITE_ID,
        report: runtimeReport(admission, `sha256:${"0".repeat(64)}`),
        dispatcher,
        instance: {
            id: NETWORK_INSTANCE_ID,
            status: "ready",
            revision: 1,
            profile: { id: "ulvia.official", version: "1.0.0" },
        },
        contentRevision: async () => 1,
        kernel: emptyKernel(),
    };
    return {
        contracts: [admission.release],
        authenticateControlToken: async (token: string) =>
            token === NETWORK_TOKEN ? { resource: runtime, release: () => undefined } : null,
        authenticateInvocationToken: async (token: string) => {
            try {
                const claims = verifyProviderInvocationToken(token, NETWORK_TOKEN);
                return claims.instanceId === NETWORK_INSTANCE_ID
                    ? { lease: { resource: runtime, release: () => undefined }, claims }
                    : null;
            } catch {
                return null;
            }
        },
    };
}

function emptyKernel(): KernelInstanceApi {
    const notFound = async () => new Response(null, { status: 404 });
    return {
        query: async () => null,
        handleAuth: notFound,
        handleCapability: notFound,
        handleQuery: notFound,
        handleCollectionAsset: notFound,
        handleSitemap: notFound,
    };
}
