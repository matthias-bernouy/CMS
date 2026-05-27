import { describe, test, expect } from "bun:test";
import { SubjectResolver, internalUserId } from "src/socle/auth/SubjectResolver";
import { InMemoryUsersRepository } from "src/socle/default-implementation/UsersRepository/memory";

type Role = "admin" | "user";
const make = () => {
    const users = new InMemoryUsersRepository<Role>();
    return { users, resolver: new SubjectResolver<Role>(users, "user") };
};

describe("internalUserId", () => {
    test("namespaces sub by provider, falls back to bare sub", () => {
        expect(internalUserId("local", "123")).toBe("local:123");
        expect(internalUserId("google", "123")).toBe("google:123");
        expect(internalUserId(undefined, "123")).toBe("123");
    });
});

describe("SubjectResolver", () => {
    test("fromIdentity records under provider:sub and assigns the default role", async () => {
        const { resolver } = make();
        const subject = await resolver.fromIdentity({ sub: "123", provider: "local", displayName: "Bob" });
        expect(subject.identifier).toBe("local:123");
        expect(subject.role).toBe("user");
        expect(subject.displayName).toBe("Bob");
    });

    test("fromSub maps a known principal, null otherwise", async () => {
        const { resolver } = make();
        await resolver.fromIdentity({ sub: "123", provider: "local" });
        expect((await resolver.fromSub("local:123"))?.identifier).toBe("local:123");
        expect(await resolver.fromSub("local:999")).toBeNull();
    });

    test("a re-login keeps the role assigned in the CMS (authz never from the provider)", async () => {
        const { users, resolver } = make();
        await resolver.fromIdentity({ sub: "123", provider: "local" });
        await users.setRole("local:123", "admin");
        const subject = await resolver.fromIdentity({ sub: "123", provider: "local" });
        expect(subject.role).toBe("admin");
    });

    test("two providers with the same sub stay distinct users", async () => {
        const { resolver } = make();
        const a = await resolver.fromIdentity({ sub: "123", provider: "local" });
        const b = await resolver.fromIdentity({ sub: "123", provider: "google" });
        expect(a.identifier).not.toBe(b.identifier);
    });
});
