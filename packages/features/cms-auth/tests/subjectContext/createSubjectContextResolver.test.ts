import { describe, expect, test } from "bun:test";
import { createSubjectContextResolver, type Authentication } from "@bernouy/cms-auth";

describe("createSubjectContextResolver", () => {
    test("maps the authenticated subject identifier to userID", async () => {
        const auth: Authentication<"admin"> = {
            loginUrl: "/login",
            logoutUrl: "/logout",
            profileUrl: "/profile",
            buildLoginUrl: () => "/login",
            buildLogoutUrl: () => "/logout",
            getSubject: async () => ({ identifier: "user-123", role: "admin" }),
        };

        const resolveContext = createSubjectContextResolver(auth);
        await expect(resolveContext(new Request("http://local/x")))
            .resolves.toEqual({ userID: "user-123" });
    });

    test("returns an empty context when the request is unauthenticated", async () => {
        const auth: Authentication<"admin"> = {
            loginUrl: "/login",
            logoutUrl: "/logout",
            profileUrl: "/profile",
            buildLoginUrl: () => "/login",
            buildLogoutUrl: () => "/logout",
            getSubject: async () => null,
        };

        const resolveContext = createSubjectContextResolver(auth);
        await expect(resolveContext(new Request("http://local/x")))
            .resolves.toEqual({});
    });
});
