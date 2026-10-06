import { expect, test } from "bun:test";
import { readGatewayHttpInput } from "@bernouy/cms-gateway/http/handlers";
import { HttpGatewayTransport } from "@bernouy/cms-gateway/http";
import { snapshotInvocation } from "cms-gateway/invocation/core/snapshotInvocation";
import { gatewayRoute } from "../fixtures";

const CONTRACT_SIZED_TEXT = "x".repeat(1024 * 1024);

test("Gateway JSON envelopes preserve a contract-sized Page document", async () => {
    const body = JSON.stringify({ content: CONTRACT_SIZED_TEXT });
    expect(
        await readGatewayHttpInput(
            new Request("https://control.example/.cms/call/ulvia.cms.pages/update", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body,
            }),
        ),
    ).toEqual({ content: CONTRACT_SIZED_TEXT });
    expect(
        snapshotInvocation({
            siteId: "default",
            contractId: "ulvia.cms.pages",
            capabilityId: "update",
            origin: "control",
            actor: { kind: "administrator", subjectId: "admin-1" },
            input: { content: CONTRACT_SIZED_TEXT },
        }).input,
    ).toEqual({ content: CONTRACT_SIZED_TEXT });
});

test("the default provider response budget includes a contract-sized Page document", async () => {
    const route = await gatewayRoute();
    const transport = new HttpGatewayTransport({
        network: { exchange: async () => Response.json({ content: CONTRACT_SIZED_TEXT }) },
    });
    const response = await transport.send({
        requestId: "request-1",
        siteId: "default",
        installationId: "official-local",
        endpoint: "https://provider.example.com",
        providerTokenRef: "${PROVIDER_TOKEN}",
        release: route.release.admission.release,
        capability: route.release.admission.release.capabilities[0]!,
        binding: route.release.admission.bindings[0]!.binding,
        input: { term: "page" },
        invocationOrigin: "control",
        actorKind: "administrator",
    });
    expect(response).toMatchObject({ output: { content: CONTRACT_SIZED_TEXT } });
});
