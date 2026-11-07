import { createProviderHandler, DefaultProviderCapabilityDispatcher } from "@bernouy/cms-gateway/provider/server";
import type { ProviderRuntimeOptions } from "@bernouy/ulvia-sdk/provider";
import { createProvider } from "@bernouy/ulvia-sdk/provider";
import { compileProvider } from "@bernouy/ulvia-sdk/build";
import { notesProviderDefinition } from "../../examples/provider";
import { expect, test } from "bun:test";
import { runningNotes, SITE } from "./support/network";

test("a generated SDK Provider receives a real signed HTTP call from CapabilityGateway", async () => {
    const f = await runningNotes();
    try {
        const result = await f.gateway.invoke({
            siteId: SITE,
            contractId: "example/notes",
            capabilityId: "notes.read",
            input: { id: "welcome" },
            actor: { kind: "administrator", subjectId: "cms-user-a" },
        });
        expect(result).toMatchObject({ output: { id: "welcome", text: "Hello from the SDK" } });
        expect(f.build.manifest.manifest.implementations[0]).toMatchObject({ digest: f.build.contracts[0]!.digest });
        expect(f.counts()).toEqual({
            reads: 1,
            factories: 1,
            exchanges: 1,
            authentications: 1,
            authorizations: 1,
            gatewayAuthorizations: 1,
        });
        expect(
            await f.gateway.invoke({
                siteId: SITE,
                contractId: "example/notes",
                capabilityId: "notes.read",
                input: { id: "missing" },
                actor: { kind: "administrator", subjectId: "cms-user-a" },
            }),
        ).toMatchObject({ kind: "declared-error", errorCode: "NOT_FOUND", retryable: false });
        expect(f.counts().reads).toBe(2);
    } finally {
        await f.close();
    }
});

test("declared errors are mapped by the current binding while invalid/auth-denied calls leave business state unchanged", async () => {
    const f = await runningNotes();
    try {
        const missing = await fetch(f.signedRequest("missing"));
        expect(missing.status).toBe(404);
        expect(await missing.json()).toEqual({ error: { code: "NOT_FOUND", output: { message: "Note not found" } } });
        const before = f.counts().reads;
        expect((await fetch(new Request(`${f.origin}/notes/anything`))).status).toBe(401);
        expect((await fetch(f.signedRequest("x".repeat(65)))).status).toBe(400);
        expect((await fetch(f.signedRequest("welcome", { instanceId: "instance:another" }))).status).toBe(401);
        f.changeAuthority({ siteId: "another-site" });
        expect((await fetch(f.signedRequest("welcome"))).status).toBe(401);
        f.changeAuthority({ siteId: SITE, providerId: "example/another-provider" });
        expect((await fetch(f.signedRequest("welcome"))).status).toBe(401);
        f.changeAuthority({ providerId: f.build.manifest.manifest.providerId });
        f.deny();
        expect((await fetch(f.signedRequest("welcome"))).status).toBe(403);
        expect(f.counts().reads).toBe(before);
        await expect(
            f.gateway.invoke({
                siteId: "another-site",
                contractId: "example/notes",
                capabilityId: "notes.read",
                input: { id: "welcome" },
                actor: { kind: "administrator", subjectId: "cms-user-a" },
            }),
        ).rejects.toThrow();
        expect(f.counts().reads).toBe(before);
    } finally {
        await f.close();
    }
});

test("SDK assembly adds no extra authentication, authorization or business calls per request", async () => {
    const build = await compileProvider(notesProviderDefinition("http://127.0.0.1:5103"));
    for (const sdk of [false, true]) {
        const counts = { authentication: 0, authorization: 0, business: 0 };
        const options: ProviderRuntimeOptions = {
            scope: { siteId: "site-test", instanceId: "instance:test" },
            authenticate: async (request) => {
                counts.authentication++;
                return {
                    siteId: "site-test",
                    providerId: build.manifest.manifest.providerId,
                    claims: {
                        version: 1,
                        requestId: request.headers.get("x-ulvia-request-id")!,
                        instanceId: "instance:test",
                        contractId: "example/notes",
                        contractVersion: "1.0.0",
                        capabilityId: "notes.read",
                        issuedAt: 1,
                        expiresAt: 2,
                    },
                };
            },
            authorize: async () => {
                counts.authorization++;
                return true;
            },
        };
        let receive: (request: Request) => Promise<Response>;
        if (sdk) {
            receive = createProvider(
                build,
                {
                    notes: {
                        read: async (id) => {
                            counts.business++;
                            return { id, text: "Hello" };
                        },
                    },
                },
                options,
            ).fetch;
        } else {
            const dispatcher = new DefaultProviderCapabilityDispatcher();
            dispatcher.register("example/notes", "notes.read", async (input) => {
                counts.business++;
                return { id: input.id, text: "Hello" };
            });
            receive = createProviderHandler({ contracts: build.implementedContracts, dispatcher, ...options });
        }
        for (let call = 0; call < 20; call++) {
            const response = await receive(
                new Request("http://127.0.0.1:5103/notes/welcome", {
                    headers: { "x-ulvia-request-id": crypto.randomUUID() },
                }),
            );
            expect(response.status).toBe(200);
            expect(await response.json()).toEqual({ id: "welcome", text: "Hello" });
        }
        expect(counts).toEqual({ authentication: 20, authorization: 20, business: 20 });
    }
});
