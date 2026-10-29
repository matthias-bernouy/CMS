import {
    CapabilityGateway,
    CatalogueGatewayRouteResolver,
    GatewayAuthorityReads,
    type CapabilityGatewayOptions,
    type CatalogueGatewayRouteResolverOptions,
} from "@bernouy/cms-gateway";
import { HttpGatewayTransport, invocationAuthority } from "@bernouy/cms-gateway/http";
import { NodeGatewayHttpNetwork } from "@bernouy/cms-gateway/http/node";
import type { ProviderExecutionState } from "@bernouy/cms-repository/providers/selections";
import { gatewayRoute } from "../../../../../../features/cms-gateway/tests/fixtures";
import { createInvocationIssuer } from "../../../../src/runtime/gateway/providers/authority/issueInvocation";

export async function initialReadsFixture() {
    const route = structuredClone(await gatewayRoute());
    route.installation.observation!.observedAt = new Date().toISOString();
    let state: ProviderExecutionState = {
        selections: {
            siteId: "site-a",
            revision: 1,
            dependencyRevision: "initial",
            grants: { default: "allow-selected", denied: [] },
            plan: { selections: [route.selection] } as never,
        },
        installations: [route.installation],
    };
    let captures = 0;
    let payloadReads = 0;
    let sends = 0;
    let beforeSecret = () => {};
    const contexts: GatewayAuthorityReads[] = [];
    const selections = {
        get: async () => {
            payloadReads++;
            return structuredClone(state.selections);
        },
    } as CatalogueGatewayRouteResolverOptions["selections"];
    const installations = {
        get: async () => {
            payloadReads++;
            return structuredClone(state.installations[0] ?? null);
        },
    } as CatalogueGatewayRouteResolverOptions["installations"];
    const reader = {
        read: async (_siteId: string, ids: readonly string[]) => {
            captures++;
            return structuredClone({
                ...state,
                installations: state.installations.filter((item) => ids.includes(item.installation.id)),
            });
        },
    };
    const catalogue = new CatalogueGatewayRouteResolver({
        selections,
        installations,
        executionState: reader,
        releases: { get: async () => route.release } as unknown as CatalogueGatewayRouteResolverOptions["releases"],
        manifests: {
            findByDigest: async () => route.manifest,
        } as unknown as CatalogueGatewayRouteResolverOptions["manifests"],
    });
    await catalogue.resolve("site-a", "catalog");
    captures = 0;
    payloadReads = 0;
    const issue = createInvocationIssuer(
        "site-a",
        catalogue,
        selections,
        { authorize: async () => true, consumeBudget: async () => true },
        async () => {
            beforeSecret();
            return "signing-secret-" + "s".repeat(43);
        },
        undefined,
        undefined,
        undefined,
        {
            capture: (ids) => GatewayAuthorityReads.capture("site-a", selections, installations, reader, ids),
            check: (route, capabilityId) => catalogue.checkAuthority(route, capabilityId),
        },
    );
    const network = new NodeGatewayHttpNetwork({
        allowPrivateAddresses: true,
        resolveAddresses: async () => [{ address: "192.168.1.10", family: 4 }],
        authorize: async (request) => ({
            token: (await issue(invocationAuthority(request), request.authorityReads)).token,
        }),
        sendPinned: async (request) => {
            sends++;
            if (Object.keys(request.headers).some((name) => /authorityReads|preparation/i.test(name))) {
                throw new Error("Preparation context leaked to HTTP headers");
            }
            return new Response(JSON.stringify({ items: ["one"] }), {
                headers: { "content-type": "application/json" },
            });
        },
    });
    const options: CapabilityGatewayOptions = {
        transportFencesRoute: true,
        routes: catalogue,
        transport: new HttpGatewayTransport({ network }),
        prepareRoute: async (value) => {
            const reads = await catalogue.capture(value.siteId, value.contractId);
            contexts.push(reads);
            return { reads, route: await catalogue.resolve(value.siteId, value.contractId, reads) };
        },
        authorize: async (_actor, _capability, _route, reads) =>
            Boolean(
                (reads ? await reads.selection(selections, "site-a") : await selections.get("site-a"))?.grants
                    .default === "allow-selected",
            ),
    };
    return {
        gateway: new CapabilityGateway(options),
        options,
        contexts,
        get captures() {
            return captures;
        },
        get payloadReads() {
            return payloadReads;
        },
        get sends() {
            return sends;
        },
        set beforeSecret(value: typeof beforeSecret) {
            beforeSecret = value;
        },
        revoke: (kind: "grant" | "installation") => {
            state =
                kind === "grant"
                    ? {
                          ...state,
                          selections: {
                              ...state.selections!,
                              revision: 2,
                              grants: {
                                  default: "allow-selected",
                                  denied: [{ contractId: "catalog", capabilityId: "item.list" }],
                              },
                          },
                      }
                    : {
                          ...state,
                          installations: [
                              {
                                  ...state.installations[0]!,
                                  installation: { ...state.installations[0]!.installation, status: "disabled" },
                              },
                          ],
                      };
        },
    };
}

export const invocation = {
    siteId: "site-a",
    contractId: "catalog",
    capabilityId: "item.list",
    input: { term: "one" },
    actor: { kind: "anonymous" as const },
};
