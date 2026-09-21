import { describe, test, expect } from "bun:test";
import { SubjectResolver, internalUserId } from "cms-auth/core/SubjectResolver";
import { InMemoryUsersRepository } from "cms-auth/default-implementation/memory/InMemoryUsersRepository";

const make = () => {
    const users = new InMemoryUsersRepository();
    return { users, resolver: new SubjectResolver(users) };
};

describe("internalUserId", () => {
    test("namespaces sub by provider, falls back to bare sub", () => {
        expect(internalUserId("local", "123")).toBe("local:123");
        expect(internalUserId("google", "123")).toBe("google:123");
        expect(internalUserId(undefined, "123")).toBe("123");
    });
});

describe("SubjectResolver", () => {
    test("fromIdentity records a namespaced member", async () => {
        const { resolver } = make();
        const subject = await resolver.fromIdentity({ sub: "123", provider: "local", email: "bob@example.com" });
        expect(subject.identifier).toBe("local:123");
        expect(subject.email).toBe("bob@example.com");
        expect(subject).not.toHaveProperty("displayName");
    });

    test("fromSub maps a known principal, null otherwise", async () => {
        const { resolver } = make();
        await resolver.fromIdentity({ sub: "123", provider: "local" });
        expect((await resolver.fromSub("local:123"))?.identifier).toBe("local:123");
        expect(await resolver.fromSub("local:999")).toBeNull();
    });

    test("a re-login refreshes the same member", async () => {
        const { users, resolver } = make();
        await resolver.fromIdentity({ sub: "123", provider: "local" });
        const subject = await resolver.fromIdentity({ sub: "123", provider: "local" });
        expect(subject.identifier).toBe("local:123");
        expect((await users.list()).total).toBe(1);
    });

    test("two providers with the same sub stay distinct users", async () => {
        const { resolver } = make();
        const a = await resolver.fromIdentity({ sub: "123", provider: "local" });
        const b = await resolver.fromIdentity({ sub: "123", provider: "google" });
        expect(a.identifier).not.toBe(b.identifier);
    });
});
