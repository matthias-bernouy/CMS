import { expect, test } from "bun:test";
import { HttpGatewayTransport } from "@bernouy/cms-gateway/http";
import { NodeGatewayHttpNetwork } from "@bernouy/cms-gateway/http/node";
import { verifyProviderInvocationToken } from "@bernouy/cms-gateway/protocol";
import { gatewayRoute } from "../fixtures";

const PROVIDER_SECRET = "provider-secret-that-is-long-enough";

test("node transport pins the target and signs the exact capability grant", async () => {
    const sent: Array<{ url: string; address: string; headers: Readonly<Record<string, string>> }> = [];
    const fixture = await gatewayRoute();
    const transport = new HttpGatewayTransport({
        network: new NodeGatewayHttpNetwork({
            resolveAddresses: async () => [{ address: "127.0.0.1", family: 4 }],
            resolveToken: async () => PROVIDER_SECRET,
            sendPinned: async (request) => {
                sent.push({ url: request.url.href, address: request.address.address, headers: request.headers });
                return Response.json({ items: ["one"] });
            },
        }),
    });
    const result = await transport.send({
        requestId: "00000000-0000-4000-8000-000000000001",
        instanceId: "instance:account-a",
        installationId: "installation-a",
        endpoint: "http://127.0.0.1:8080",
        providerTokenRef: "token-ref",
        release: fixture.release.admission.release,
        capability: fixture.release.admission.release.capabilities[0]!,
        binding: fixture.release.admission.bindings[0]!.binding,
        input: { term: "one" },
        subjectId: "subject-a",
    });
    expect(result).toMatchObject({ status: 200, output: { items: ["one"] } });
    expect(sent[0]).toMatchObject({
        url: "http://127.0.0.1:8080/v1/items?term=one",
        address: "127.0.0.1",
        headers: {
            accept: "application/json",
            "x-ulvia-request-id": "00000000-0000-4000-8000-000000000001",
        },
    });
    const authorization = sent[0]!.headers.authorization!;
    expect(authorization).not.toContain(PROVIDER_SECRET);
    expect(verifyProviderInvocationToken(authorization.slice(7), PROVIDER_SECRET)).toMatchObject({
        requestId: "00000000-0000-4000-8000-000000000001",
        instanceId: "instance:account-a",
        contractId: "catalog",
        contractVersion: "1.0.0",
        capabilityId: "item.list",
        subjectId: "subject-a",
    });
    expect(Object.keys(sent[0]!.headers).filter((name) => name.startsWith("x-ulvia-"))).toEqual(["x-ulvia-request-id"]);
});

test("provider credentials remain opaque and are never forwarded byte-for-byte", async () => {
    const resolvedReferences: string[] = [];
    const sentAuthorizations: string[] = [];
    const opaqueReference = "provider-secret/account-a/installation-private-ref";
    const opaqueCredential = "account=a;cms-instance=private-42;route=provider-owned";
    const fixture = await gatewayRoute();
    const transport = new HttpGatewayTransport({
        network: new NodeGatewayHttpNetwork({
            resolveAddresses: async () => [{ address: "8.8.8.8", family: 4 }],
            resolveToken: async (reference) => {
                resolvedReferences.push(reference);
                return opaqueCredential;
            },
            sendPinned: async (request) => {
                sentAuthorizations.push(request.headers.authorization ?? "");
                return Response.json({ items: [] });
            },
        }),
    });
    await transport.send({
        requestId: "00000000-0000-4000-8000-000000000002",
        instanceId: "instance:account-a",
        installationId: "installation-a",
        endpoint: "https://provider.example.com",
        providerTokenRef: opaqueReference,
        release: fixture.release.admission.release,
        capability: fixture.release.admission.release.capabilities[0]!,
        binding: fixture.release.admission.bindings[0]!.binding,
        input: { term: "opaque" },
    });
    expect(resolvedReferences).toEqual([opaqueReference]);
    expect(sentAuthorizations).toHaveLength(1);
    expect(sentAuthorizations[0]).not.toBe(`Bearer ${opaqueCredential}`);
    expect(verifyProviderInvocationToken(sentAuthorizations[0]!.slice(7), opaqueCredential)).toMatchObject({
        instanceId: "instance:account-a",
        contractId: "catalog",
        contractVersion: "1.0.0",
        capabilityId: "item.list",
    });
});

test("the durable provider credential is restricted to the runtime report", async () => {
    const authorizations: string[] = [];
    const network = new NodeGatewayHttpNetwork({
        resolveAddresses: async () => [{ address: "127.0.0.1", family: 4 }],
        resolveToken: async () => PROVIDER_SECRET,
        sendPinned: async (request) => {
            authorizations.push(request.headers.authorization!);
            return Response.json({});
        },
    });
    const request = {
        origin: "http://127.0.0.1:8080",
        pathAndQuery: "/ulvia/report",
        method: "GET",
        headers: {},
        requestId: "00000000-0000-4000-8000-000000000003",
        providerTokenRef: "token-ref",
        authentication: { kind: "provider-control" as const },
        signal: new AbortController().signal,
    };
    await network.exchange(request);
    expect(authorizations).toEqual([`Bearer ${PROVIDER_SECRET}`]);
    await expect(network.exchange({ ...request, pathAndQuery: "/v1/items" })).rejects.toThrow("restricted");
});

test("node transport can delegate exact capability authorization to a remote broker", async () => {
    const authorized: string[] = [];
    const authorizations: string[] = [];
    const network = new NodeGatewayHttpNetwork({
        resolveAddresses: async () => [{ address: "127.0.0.1", family: 4 }],
        authorize: async (request) => {
            authorized.push(request.installationId ?? "");
            return { token: "short-lived-provider-invocation" };
        },
        sendPinned: async (request) => {
            authorizations.push(request.headers.authorization!);
            return Response.json({});
        },
    });
    await network.exchange({
        origin: "http://127.0.0.1:8080",
        pathAndQuery: "/v1/items",
        method: "GET",
        headers: {},
        requestId: "00000000-0000-4000-8000-000000000004",
        installationId: "installation-a",
        providerTokenRef: "opaque-reference",
        authentication: {
            kind: "capability",
            instanceId: "instance:account-a",
            contractId: "catalog",
            contractVersion: "1.0.0",
            capabilityId: "item.list",
        },
        signal: new AbortController().signal,
    });
    expect(authorized).toEqual(["installation-a"]);
    expect(authorizations).toEqual(["Bearer short-lived-provider-invocation"]);
});
