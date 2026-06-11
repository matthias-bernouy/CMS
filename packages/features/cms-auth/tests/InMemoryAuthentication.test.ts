import { describe, expect, test } from "bun:test";
import { InMemoryAuthentication } from "@bernouy/cms-auth";

describe("InMemoryAuthentication", () => {
    test("builds dev auth URLs for same-site return paths", () => {
        const auth = new InMemoryAuthentication({ role: "admin" });
        expect(auth.buildLoginUrl("/admin")).toBe("/__dev/login?returnTo=%2Fadmin");
        expect(auth.buildLogoutUrl("/")).toBe("/__dev/logout?returnTo=%2F");
    });

    test("rejects absolute and protocol-relative return targets", () => {
        const auth = new InMemoryAuthentication({ role: "admin" });
        expect(() => auth.buildLoginUrl("https://example.com/admin")).toThrow();
        expect(() => auth.buildLoginUrl("//example.com/admin")).toThrow();
        expect(() => auth.buildLoginUrl("/\\example.com/admin")).toThrow();
    });
});
