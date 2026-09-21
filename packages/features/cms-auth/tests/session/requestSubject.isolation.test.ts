import { describe, expect, test } from "bun:test";
import { resolveRequestSubject, type Subject } from "@bernouy/cms-auth";
import { TestAuthentication } from "./requestSubjectSupport";

describe("resolveRequestSubject isolation", () => {
    test("protects the canonical snapshot from backend and caller mutation", async () => {
        const backendSubject: Subject = {
            identifier: "user-1",
            email: "user@example.com",
        };
        const authentication = new TestAuthentication(async () => backendSubject);
        const request = new Request("https://cms.test/admin");

        const first = await resolveRequestSubject(authentication, request);
        backendSubject.email = "backend-change@example.com";
        first!.email = "changed@example.com";
        const second = await resolveRequestSubject(authentication, request);

        expect(second).toEqual({
            identifier: "user-1",
            email: "user@example.com",
        });
        expect(second).not.toBe(first);
        expect(authentication.calls).toBe(1);
    });

    test("reads a fresh subject for a second Request", async () => {
        let email = "first@example.com";
        const authentication = new TestAuthentication(async () => ({ identifier: "user-1", email }));
        const firstRequest = new Request("https://cms.test/admin");

        expect((await resolveRequestSubject(authentication, firstRequest))?.email).toBe("first@example.com");
        email = "second@example.com";
        expect((await resolveRequestSubject(authentication, firstRequest))?.email).toBe("first@example.com");
        expect((await resolveRequestSubject(authentication, new Request("https://cms.test/admin")))?.email).toBe(
            "second@example.com",
        );
        expect(authentication.calls).toBe(2);
    });

    test("does not transfer an ingress subject to a synthetic Request", async () => {
        const authentication = new TestAuthentication(async (request) =>
            request.headers.get("x-test-subject") === "user-1" ? { identifier: "user-1" } : null,
        );
        const ingress = new Request("https://cms.test/source", {
            headers: { "x-test-subject": "user-1" },
        });
        const synthetic = new Request("https://cms.internal/function");

        expect(await resolveRequestSubject(authentication, ingress)).toEqual({
            identifier: "user-1",
        });
        expect(await resolveRequestSubject(authentication, synthetic)).toBeNull();
        expect(authentication.calls).toBe(2);
    });
});
