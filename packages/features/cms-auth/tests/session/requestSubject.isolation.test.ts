import { describe, expect, test } from "bun:test";
import { resolveRequestSubject, type Subject } from "@bernouy/cms-auth";
import { TestAuthentication } from "./requestSubjectSupport";

type Role = "admin" | "user";

describe("resolveRequestSubject isolation", () => {
    test("protects the canonical snapshot from backend and caller mutation", async () => {
        const backendSubject: Subject<Role> = {
            identifier: "user-1",
            role: "user",
            email: "user@example.com",
        };
        const authentication = new TestAuthentication<Role>(async () => backendSubject);
        const request = new Request("https://cms.test/admin");

        const first = await resolveRequestSubject(authentication, request);
        backendSubject.role = "admin";
        first!.email = "changed@example.com";
        const second = await resolveRequestSubject(authentication, request);

        expect(second).toEqual({
            identifier: "user-1",
            role: "user",
            email: "user@example.com",
        });
        expect(second).not.toBe(first);
        expect(authentication.calls).toBe(1);
    });

    test("reads a fresh role for a second Request", async () => {
        let role: Role = "user";
        const authentication = new TestAuthentication<Role>(async () => ({ identifier: "user-1", role }));
        const firstRequest = new Request("https://cms.test/admin");

        expect((await resolveRequestSubject(authentication, firstRequest))?.role).toBe("user");
        role = "admin";
        expect((await resolveRequestSubject(authentication, firstRequest))?.role).toBe("user");
        expect((await resolveRequestSubject(authentication, new Request("https://cms.test/admin")))?.role).toBe(
            "admin",
        );
        expect(authentication.calls).toBe(2);
    });

    test("does not transfer an ingress subject to a synthetic Request", async () => {
        const authentication = new TestAuthentication<Role>(async (request) =>
            request.headers.get("x-test-subject") === "user-1" ? { identifier: "user-1", role: "user" } : null,
        );
        const ingress = new Request("https://cms.test/source", {
            headers: { "x-test-subject": "user-1" },
        });
        const synthetic = new Request("https://cms.internal/function");

        expect(await resolveRequestSubject(authentication, ingress)).toEqual({
            identifier: "user-1",
            role: "user",
        });
        expect(await resolveRequestSubject(authentication, synthetic)).toBeNull();
        expect(authentication.calls).toBe(2);
    });
});
