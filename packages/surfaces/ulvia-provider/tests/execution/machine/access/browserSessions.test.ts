import { expect, test } from "bun:test";
import {
    InMemoryLocalCredentialStore,
    InMemoryUsersRepository,
    InMemorySessionRepository,
    LocalAuthentication,
    SessionTokenService,
    SubjectResolver,
} from "@bernouy/cms-auth";
import { ProviderCapabilityResponse } from "@bernouy/ulvia-provider";
import type { ProviderCapabilityInvocationContext } from "@bernouy/ulvia-provider";
import { accessServices } from "./services";
import { accessTransport } from "./transport";

const context: ProviderCapabilityInvocationContext = {
    requestId: "00000000-0000-4000-8000-000000000001",
    contractVersion: "1.0.0",
    siteId: "default",
    providerId: "ulvia/primary-provider",
};

test("Access logout revokes the exact browser session before returning its clear effect", async () => {
    const repository = new InMemorySessionRepository();
    const sessions = new SessionTokenService({ repository });
    const users = new InMemoryUsersRepository();
    const credentials = new InMemoryLocalCredentialStore();
    const authentication = new LocalAuthentication({
        providerId: "local",
        credentials,
        resolver: new SubjectResolver(users),
        sessions,
    });
    await credentials.create({ email: "member@example.test", password: "safe-password" });
    const dispatcher = await accessTransport(accessServices({ users, authentication }));
    const login = (await dispatcher.invoke(
        "ulvia/cms.access",
        "login-password",
        {
            email: "member@example.test",
            password: "safe-password",
        },
        context,
    )) as ProviderCapabilityResponse;
    expect(login.responseEffect?.operation).toBe("establish");
    if (login.responseEffect?.operation !== "establish") {
        throw new Error("login did not establish session");
    }
    const caller = { ...context, actorCredential: { kind: "session" as const, token: login.responseEffect.token } };
    expect(await dispatcher.invoke("ulvia/cms.access", "resolve-actor", {}, caller)).toMatchObject({
        state: "authenticated",
    });
    repository.revoke = async () => {
        throw new Error("session persistence unavailable");
    };
    await expect(dispatcher.invoke("ulvia/cms.access", "logout", {}, caller)).rejects.toThrow("CORE_UNAVAILABLE");
    expect(await dispatcher.invoke("ulvia/cms.access", "resolve-actor", {}, caller)).toMatchObject({
        state: "authenticated",
    });
    repository.revoke = InMemorySessionRepository.prototype.revoke.bind(repository);
    const logout = (await dispatcher.invoke("ulvia/cms.access", "logout", {}, caller)) as ProviderCapabilityResponse;
    expect(logout.responseEffect).toEqual({ type: "session", operation: "clear" });
    expect(await dispatcher.invoke("ulvia/cms.access", "resolve-actor", {}, caller)).toEqual({ state: "anonymous" });
});
