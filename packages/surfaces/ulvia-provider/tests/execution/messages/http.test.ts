import { expect, test } from "bun:test";
import { NOOP_LOGGER } from "@bernouy/logging";
import { compileProviderRoutes } from "@bernouy/cms-gateway/provider/server";
import type { ProviderInvocationClaims } from "@bernouy/cms-gateway/protocol";
import { encodeRequestContext, REQUEST_CONTEXT_HEADER } from "@bernouy/cms-gateway/protocol";
import { DefaultProviderCapabilityDispatcher, ProviderCapabilityDispatchError } from "@bernouy/ulvia-provider";
import { mountContentForTest } from "../../capabilities/content/mount";
import { createProviderContractRelay } from "../../../src/transport/relay";
import { resolvedContract } from "./fixtures";

function claims(contractId: string, capabilityId: string): ProviderInvocationClaims {
    return {
        version: 1,
        requestId: crypto.randomUUID(),
        instanceId: "instance-a",
        contractId,
        contractVersion: "1.0.0",
        capabilityId,
        issuedAt: 0,
        expiresAt: 9999999999,
    };
}

test("official HTTP errors preserve codes and localized messages, while technical diagnostics stay in logs", async () => {
    const contract = await resolvedContract("ulvia/cms.content");
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    let attempts = 0;
    await mountContentForTest(dispatcher, {
        repo: {
            insertPage: async () => {
                attempts++;
                throw new TypeError("private database password");
            },
        },
    } as never);
    const observed: unknown[] = [];
    const relay = createProviderContractRelay(
        compileProviderRoutes([contract]),
        dispatcher,
        { siteId: "default", providerId: "ulvia/primary-provider" },
        {
            ...NOOP_LOGGER,
            error: (...args) => {
                observed.push(args);
            },
        },
    );
    const invoke = (title: string, preference: string | undefined) => {
        const identity = claims("ulvia/cms.content", "pages.create");
        return relay(
            new Request("https://provider.test/pages/create", {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    "x-ulvia-request-id": identity.requestId,
                    "accept-language": "fr",
                    [REQUEST_CONTEXT_HEADER]: encodeRequestContext({
                        headers: preference ? { "accept-language": preference } : {},
                    }),
                },
                body: JSON.stringify({ path: "/draft", title }),
            }),
            identity,
        );
    };
    const invalid = (await invoke("   ", "fr-CA,en;q=0.8"))!;
    expect(invalid.status).toBe(422);
    expect(invalid.headers.get("content-language")).toBe("fr");
    expect(await invalid.json()).toEqual({
        error: { code: "INVALID_PAGE", output: { message: "Le titre de la page ne peut pas être vide." } },
    });
    expect(attempts).toBe(0);
    expect(observed).toHaveLength(0);
    const unavailable = (await invoke("Valid title", "fr"))!;
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.get("content-language")).toBe("fr");
    const body = await unavailable.text();
    expect(JSON.parse(body)).toEqual({
        error: {
            code: "CORE_UNAVAILABLE",
            output: { message: "Le service est temporairement indisponible. Réessayez plus tard." },
        },
    });
    expect(body).not.toContain("password");
    expect(attempts).toBe(1);
    expect(observed).toHaveLength(1);
    const defaultLanguage = (await invoke("Valid title", undefined))!;
    expect(defaultLanguage.headers.get("content-language")).toBe("en");
});

test("HEAD failures retain error status, code and Content-Language without a body", async () => {
    const contract = await resolvedContract("ulvia/cms.files");
    const capability = contract.capabilities.find(
        ({ definition }) =>
            definition.output.type === "binary" &&
            definition.bindings.some((binding) => binding.transport === "http" && binding.method === "GET"),
    )!;
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    dispatcher.register(contract.release.contractId, capability.definition.id, async () => {
        throw new ProviderCapabilityDispatchError("NOT_FOUND", 404);
    });
    const routes = compileProviderRoutes([contract]);
    const route = routes.find((candidate) => candidate.capability.id === capability.definition.id)!;
    const identity = claims(contract.release.contractId, capability.definition.id);
    const path = route.capability.binding.path.replace(/\{[^}]+\}/gu, "missing");
    const relay = createProviderContractRelay(
        routes,
        dispatcher,
        { siteId: "default", providerId: "ulvia/primary-provider" },
        NOOP_LOGGER,
    );
    const response = (await relay(
        new Request(`https://provider.test${path}`, {
            method: "HEAD",
            headers: { "x-ulvia-request-id": identity.requestId, "accept-language": "fr" },
        }),
        identity,
    ))!;
    expect(response.status).toBe(404);
    expect(response.headers.get("x-ulvia-error-code")).toBe("NOT_FOUND");
    expect(response.headers.get("content-language")).toBe("fr");
    expect(await response.text()).toBe("");
});
