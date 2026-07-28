import type { Runner } from "@bernouy/http-runner";
import type { RepositoryCatalogRuntime } from "./catalogRuntime";

const STATUS_HEADERS = {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
};

export function mountRepositoryHealthRoutes(runner: Runner, catalog: RepositoryCatalogRuntime): void {
    runner.get("/health", () => statusResponse(catalog, false));
    runner.get("/ready", () => statusResponse(catalog, true));
}

function statusResponse(catalog: RepositoryCatalogRuntime, readiness: boolean): Response {
    const status = catalog.status();
    return new Response(JSON.stringify(status), {
        status: readiness && !status.ready ? 503 : 200,
        headers: STATUS_HEADERS,
    });
}
