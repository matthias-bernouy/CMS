import { expect, test } from "bun:test";
import { initializationList } from "repository/application/installations/capabilities/initialization/list";
import { mapInstallationError } from "repository/application/installations/capabilities/policy/mapError";
import { discoveryFixture } from "./fixture";

for (const phase of ["headers", "body"] as const) {
    test(`a Repository ${phase} timeout is unavailable, read-only and releases discovery for retry`, async () => {
        const f = await discoveryFixture();
        const before = await f.businessState();
        const timeout = new DOMException("Repository request timed out", "TimeoutError");
        f.observed.intercept = async (url, init) => {
            expect(init.signal).toBeInstanceOf(AbortSignal);
            expect(url.pathname.endsWith("/v1/recipes")).toBe(true);
            // Inject transport outcomes without claiming to explain the live ten-second failures.
            if (phase === "headers") {
                throw timeout;
            }
            return new Response(
                new ReadableStream({
                    start(controller) {
                        controller.error(timeout);
                    },
                }),
            );
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
