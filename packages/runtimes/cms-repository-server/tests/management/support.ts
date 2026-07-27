import { createRepositoryManagementGuard } from "@bernouy/cms-repository-management";
import type { BunRunner } from "@bernouy/http-runner";
import { InMemoryRateLimiter } from "@bernouy/rate-limiter";

export function authenticatedFetch(url: string): Promise<Response> {
    return fetch(url, { headers: { authorization: "Bearer management-secret" } });
}

export function authenticatedJson(url: string, body: string): Promise<Response> {
    return fetch(url, {
        method: "POST",
        headers: { authorization: "Bearer management-secret", "content-type": "application/json" },
        body,
    });
}

export function managementGuard() {
    return createRepositoryManagementGuard({
        serviceToken: "management-secret",
        servicePrincipal: "management-cms",
        rateLimiter: new InMemoryRateLimiter({ limit: 10, windowSeconds: 60 }),
    });
}

export function origin(runner: BunRunner): string {
    if (!runner.port) {
        throw new Error("Test runner did not start");
    }
    return `http://127.0.0.1:${runner.port}`;
}
