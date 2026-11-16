import { expect, test } from "bun:test";
import { initializationList } from "repository/application/installations/capabilities/initialization/list";
import { mapInstallationError } from "repository/application/installations/capabilities/policy/mapError";
import { discoveryFixture } from "./fixture";

for (const phase of ["catalogue", "release"] as const) {
    test(`a Repository ${phase} timeout is unavailable, read-only and releases discovery for retry`, async () => {
        const f = await discoveryFixture();
        const before = await f.businessState();
        const timeout = new DOMException("Repository request timed out", "TimeoutError");
        f.observed.intercept = async (url, init) => {
            expect(init.signal).toBeInstanceOf(AbortSignal);
            if (url.pathname.includes(phase === "catalogue" ? "/v1/catalogue" : "/v1/releases/")) {
                // Inject the transport outcome; this does not establish the cause of the live ten-second failures.
                throw timeout;
            }
            return undefined;
        };
        const failure = await f.service.list().then(
            () => {
                throw new Error("Discovery unexpectedly succeeded");
            },
            (error: unknown) => error,
        );
        expect(failure).toBe(timeout);
        expect(mapInstallationError(failure, initializationList)).toMatchObject({ code: "CORE_UNAVAILABLE" });
        expect(f.observed.verifications).toBe(0);
        expect(await f.businessState()).toEqual(before);
        f.observed.intercept = undefined;
        expect((await f.service.list()).items).toHaveLength(1);
        expect(await f.businessState()).toEqual(before);
    });
}
