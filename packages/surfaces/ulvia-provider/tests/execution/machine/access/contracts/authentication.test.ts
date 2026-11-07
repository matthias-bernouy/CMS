import { describe, expect, test } from "bun:test";
import { ProviderCapabilityResponse, type ProviderCapabilityInvocationContext } from "@bernouy/ulvia-provider";
import { accessServices } from "../services";
import { accessTransport } from "../transport";

const context: ProviderCapabilityInvocationContext = {
    requestId: "00000000-0000-4000-8000-000000000001",
    contractVersion: "1.0.0",
    siteId: "default",
    providerId: "ulvia/primary-provider",
    subjectId: "provider-admin",
};

describe("Access authentication capabilities", () => {
    test("resolves opaque credentials and returns semantic session effects", async () => {
        const subject = { identifier: "local:member", email: "member@example.test" };
        const admin = { identifier: "local:admin", email: "admin@example.test" };
        const dependencies = {
            authentication: {
                revokeCredential: async () => {},
                revokeSessionsForSub: async () => {},
                authenticate: async (email: string | undefined, password: string | undefined) =>
                    email === subject.email && password === "correct-password"
                        ? {
                              ok: true as const,
                              subject,
                              session: { token: "opaque-session", expiresAt: "2030-01-01T00:00:00.000Z" },
                          }
                        : { ok: false as const, error: "invalid_credentials" as const },
                resolveCredential: async (credential: ProviderCapabilityInvocationContext["actorCredential"]) => {
                    if (credential?.token === "valid-user-session") {
                        return subject;
                    }
                    return credential?.token === "valid-admin-session" ? admin : null;
                },
            },
            accountLifecycle: {
                signup: async () => ({ ok: true }),
                requestEmailVerification: async () => ({ sent: true }),
                confirmEmailVerification: async () => ({ verified: true }),
                requestPasswordReset: async () => ({ sent: true }),
                confirmPasswordReset: async () => ({ reset: true }),
            },
        };
        const gateway = {
            administrators: {
                get: async (sub: string) => ({
                    sub,
                    enabled: sub === admin.identifier,
                    revision: sub === admin.identifier ? 7 : 2,
                    bootstrap: false,
                }),
            },
        };
        const dispatcher = await accessTransport(accessServices({ ...dependencies, governance: gateway } as never));

        expect(await dispatcher.invoke("ulvia/cms.access", "resolve-actor", {}, context)).toEqual({
            state: "anonymous",
        });
        expect(
            await dispatcher.invoke(
                "ulvia/cms.access",
                "resolve-actor",
                {},
                {
                    ...context,
                    actorCredential: { kind: "session", token: "valid-user-session" },
                },
            ),
        ).toEqual({
            state: "authenticated",
            subjectId: "local:member",
            administrator: false,
            authorizationRevision: 2,
        });
        expect(
            await dispatcher.invoke(
                "ulvia/cms.access",
                "resolve-actor",
                {},
                {
                    ...context,
                    actorCredential: { kind: "session", token: "valid-admin-session" },
                },
            ),
        ).toEqual({
            state: "authenticated",
            subjectId: "local:admin",
            administrator: true,
            authorizationRevision: 7,
        });

        const login = (await dispatcher.invoke(
            "ulvia/cms.access",
            "login-password",
            { email: subject.email, password: "correct-password" },
            context,
        )) as ProviderCapabilityResponse;
        expect(login.output).toEqual({ subjectId: "local:member", administrator: false });
        expect(login.responseEffect).toEqual({
            type: "session",
            operation: "establish",
            token: "opaque-session",
            expiresAt: "2030-01-01T00:00:00.000Z",
        });

        const logout = (await dispatcher.invoke(
            "ulvia/cms.access",
            "logout",
            {},
            context,
        )) as ProviderCapabilityResponse;
        expect(logout.responseEffect).toEqual({ type: "session", operation: "clear" });
        await expect(
            dispatcher.invoke(
                "ulvia/cms.access",
                "login-password",
                { email: subject.email, password: "wrong-password" },
                context,
            ),
        ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS", status: 401 });
    });
});
