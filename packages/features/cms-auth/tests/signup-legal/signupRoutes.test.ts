import { describe, expect, test } from "bun:test";
import { post, setupPublicAuthRoutes } from "../public-flows/publicAuthRouteFixtures";
import { createLegalPolicy } from "./fixtures";

describe("signup legal acceptance route boundaries", () => {
    test("keeps the feature off and backwards compatible when no policy is configured", async () => {
        const { server } = setupPublicAuthRoutes();
        try {
            const requirements = await server.request("GET", "/signup/legal-requirements");
            expect(await requirements.json()).toEqual({ documents: [] });
            expect((await post(server, "/signup", { email: "legacy@x.com", password: "password-1" })).status).toBe(200);
        } finally {
            server.stop();
        }
    });

    test("requires current ids and ignores forged client snapshots or hashes", async () => {
        const legal = createLegalPolicy();
        const { server, users } = setupPublicAuthRoutes({ signupLegalAcceptance: legal.policy });
        try {
            const requirements = await server.request("GET", "/signup/legal-requirements");
            const versionId = ((await requirements.json()) as { documents: Array<{ versionId: string }> }).documents[0]!
                .versionId;
            const missing = await post(server, "/signup", {
                email: "missing@x.com",
                password: "password-1",
            });
            expect(missing.status).toBe(400);

            const created = await post(server, "/signup", {
                email: "legal@x.com",
                password: "password-1",
                acceptedLegalDocumentVersionIds: versionId,
                contentHash: "client-forgery",
                pageSnapshot: { content: "client-forgery" },
            });
            expect(created.status).toBe(200);

            const [user] = (await users.list()).users;
            expect(user!.sub).toStartWith("local:");
            const [proof] = await legal.store.listForUser(user!.sub);
            expect(proof!.documents[0]!.pageSnapshot.content).toBe("<main>Version one</main>");
            expect(proof!.documents[0]!.contentHash).not.toBe("client-forgery");
        } finally {
            server.stop();
        }
    });

    test("rejects malformed repeated-field transport values", async () => {
        const legal = createLegalPolicy();
        const { server } = setupPublicAuthRoutes({ signupLegalAcceptance: legal.policy });
        try {
            for (const [index, value] of [42, [""], { versionId: "forged" }].entries()) {
                const response = await post(server, "/signup", {
                    email: `malformed-${index}@x.com`,
                    password: "password-1",
                    acceptedLegalDocumentVersionIds: value,
                });
                expect(response.status).toBe(400);
            }
        } finally {
            server.stop();
        }
    });
});
