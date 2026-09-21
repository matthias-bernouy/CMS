import { describe, expect, test } from "bun:test";
import { resolveRequestSubject, type Subject } from "@bernouy/cms-auth";
import { TestAuthentication } from "./requestSubjectSupport";

const USER: Subject = { identifier: "user-1", email: "user@example.com" };

describe("resolveRequestSubject request cache", () => {
    test("single-flights four concurrent resolutions", async () => {
        let release!: (subject: Subject) => void;
        const result = new Promise<Subject>((resolve) => {
            release = resolve;
        });
        const authentication = new TestAuthentication(() => result);
        const request = new Request("https://cms.test/admin");

        const pending = Array.from({ length: 4 }, () => resolveRequestSubject(authentication, request));
        await Promise.resolve();

        expect(authentication.calls).toBe(1);
        release(USER);
        expect(await Promise.all(pending)).toEqual([USER, USER, USER, USER]);
    });

    test("memoizes a missing subject within one request", async () => {
        const authentication = new TestAuthentication(async () => null);
        const request = new Request("https://cms.test/admin");

        expect(await resolveRequestSubject(authentication, request)).toBeNull();
        expect(await resolveRequestSubject(authentication, request)).toBeNull();
        expect(authentication.calls).toBe(1);
    });

    test("evicts a rejected lookup so the same request can retry", async () => {
        let shouldFail = true;
        const authentication = new TestAuthentication(async () => {
            if (shouldFail) {
                throw new Error("authentication unavailable");
            }
            return USER;
        });
        const request = new Request("https://cms.test/admin");

        const rejected = await Promise.allSettled([
            resolveRequestSubject(authentication, request),
            resolveRequestSubject(authentication, request),
            resolveRequestSubject(authentication, request),
            resolveRequestSubject(authentication, request),
        ]);
        expect(rejected.every((result) => result.status === "rejected")).toBe(true);
        expect(authentication.calls).toBe(1);

        shouldFail = false;
        expect(await resolveRequestSubject(authentication, request)).toEqual(USER);
        expect(authentication.calls).toBe(2);
    });

    test("keeps separate entries for separate authentication backends", async () => {
        const local = new TestAuthentication(async () => USER);
        const service = new TestAuthentication(async () => ({ identifier: "service-1" }));
        const request = new Request("https://cms.test/admin");

        expect(await resolveRequestSubject(local, request)).toEqual(USER);
        expect(await resolveRequestSubject(service, request)).toEqual({
            identifier: "service-1",
        });
        expect(await resolveRequestSubject(local, request)).toEqual(USER);
        expect(await resolveRequestSubject(service, request)).toEqual({
            identifier: "service-1",
        });
        expect(local.calls).toBe(1);
        expect(service.calls).toBe(1);
    });
});
