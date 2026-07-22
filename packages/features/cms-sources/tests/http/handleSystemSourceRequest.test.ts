import { describe, expect, mock, test } from "bun:test";
import { InMemorySourceRepository } from "cms-sources/default-implementation/InMemorySourceRepository";
import { CompositeSourceRepository } from "cms-sources/core/repositories/CompositeSourceRepository";
import { SYSTEM_AUTH_SOURCE } from "cms-sources/core/system/systemSources";
import { handleSourceRequest } from "cms-sources/http/handleSourceRequest";
import { okFetch, SOURCE_PREFIX } from "./handleSourceFixtures";

function systemRepository() {
    return new CompositeSourceRepository(new InMemorySourceRepository(), [SYSTEM_AUTH_SOURCE]);
}

describe("handleSourceRequest system endpoints", () => {
    test("requires a system executor", async () => {
        const response = await handleSourceRequest(
            systemRepository(),
            new Request("http://local" + SOURCE_PREFIX + "system-auth/me"),
            { prefix: SOURCE_PREFIX },
        );
        expect(response.status).toBe(501);
        expect(await response.text()).toBe("system source executor not configured");
    });

    test("delegates without proxying upstream", async () => {
        const executeSystemEndpoint = mock(
            async (_endpoint, request: Request) => new Response(request.headers.get("cookie") ?? "missing"),
        );
        const fetchImpl = okFetch();
        const response = await handleSourceRequest(
            systemRepository(),
            new Request("http://local" + SOURCE_PREFIX + "system-auth/me", {
                headers: { cookie: "site-session=abc" },
            }),
            { prefix: SOURCE_PREFIX, deps: { executeSystemEndpoint, fetchImpl } },
        );
        expect(executeSystemEndpoint).toHaveBeenCalledTimes(1);
        expect(fetchImpl).not.toHaveBeenCalled();
        expect(await response.text()).toBe("site-session=abc");
    });

    test("authorizes before running the system executor", async () => {
        const executeSystemEndpoint = mock(async () => new Response("system"));
        const authorizeEndpoint = mock(async () => false);
        const response = await handleSourceRequest(
            systemRepository(),
            new Request("http://local" + SOURCE_PREFIX + "system-auth/me"),
            { prefix: SOURCE_PREFIX, deps: { executeSystemEndpoint, authorizeEndpoint } },
        );
        expect(response.status).toBe(403);
        expect(executeSystemEndpoint).not.toHaveBeenCalled();
    });
});
