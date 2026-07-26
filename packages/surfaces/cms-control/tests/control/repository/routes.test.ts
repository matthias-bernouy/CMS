import { describe, expect, test } from "bun:test";
import type {
    RepositoryCompatibilityQuery,
    RepositoryManagementGateway,
    RepositoryReevaluationInput,
    RepositoryStablePromotionInput,
    RepositoryVersionBlockInput,
} from "@bernouy/cms-control";
import type { RouteHandler, Runner } from "@bernouy/http-runner";
import { mountRepositoryManagementRoutes } from "cms-control/core/admin/control/mountRoutes/repositoryManagement";

describe("Control repository management routes", () => {
    test("mounts an explicit allowlist and delegates normalized reads", async () => {
        const gateway = new RecordingGateway();
        const runner = configuredRunner(gateway);
        expect([...runner.routes.keys()].sort()).toEqual([
            "GET /repository/candidates/status",
            "GET /repository/compatibility",
            "GET /repository/diagnostics",
            "GET /repository/release",
            "GET /repository/status",
            "GET /repository/versions",
            "POST /repository/candidates",
            "POST /repository/publications",
            "POST /repository/reevaluations",
            "POST /repository/stable-promotions",
            "POST /repository/version-blocks",
        ]);

        expect((await runner.request("GET", "/repository/status")).status).toBe(200);
        await runner.request("GET", "/repository/versions?kind=commerce");
        await runner.request("GET", "/repository/release?kind=commerce&version=1.1.0");
        await runner.request("GET", "/repository/candidates/status?candidateId=candidate-1");
        await runner.request("GET", "/repository/compatibility?kind=commerce&version=1.1.0&after=report-1&limit=25");
        expect(gateway.calls).toEqual([
            ["status"],
            ["versions", "commerce"],
            ["release", "commerce", "1.1.0"],
            ["candidateStatus", "candidate-1"],
            ["compatibility", { kind: "commerce", version: "1.1.0", after: "report-1", limit: 25 }],
        ]);
    });

    test("forwards bounded package bytes and mutation inputs without accepting an actor", async () => {
        const gateway = new RecordingGateway();
        const runner = configuredRunner(gateway);
        await runner.request("POST", "/repository/publications", '{"schema":"v1"}');
        await runner.request("POST", "/repository/candidates", '{"schema":"candidate-v1"}');
        await runner.request("POST", "/repository/reevaluations", {
            kind: "commerce",
            version: "1.1.0",
            currentReportRevisionId: "report-1",
            currentDecision: { revisionId: "decision-1", digest: "a".repeat(64) },
            reason: "New evaluator",
            evidenceIds: ["ci-1"],
        });
        await runner.request("POST", "/repository/stable-promotions", {
            kind: "commerce",
            version: "1.1.0",
            currentReportRevisionId: "report-2",
            confirmation: { version: "1.1.0", reportRevisionId: "report-2" },
        });
        await runner.request("POST", "/repository/version-blocks", {
            kind: "commerce",
            version: "1.1.0",
            currentDecision: { revisionId: "decision-1", digest: "a".repeat(64) },
            reason: "Incident",
            confirmation: {
                action: "block",
                kind: "commerce",
                version: "1.1.0",
                decisionRevisionId: "decision-1",
                decisionDigest: "a".repeat(64),
            },
        });

        expect(new TextDecoder().decode(gateway.published)).toBe('{"schema":"v1"}');
        expect(new TextDecoder().decode(gateway.candidate)).toBe('{"schema":"candidate-v1"}');
        expect(gateway.reevaluation).toEqual({
            kind: "commerce",
            version: "1.1.0",
            currentReportRevisionId: "report-1",
            currentDecision: { revisionId: "decision-1", digest: "a".repeat(64) },
            reason: "New evaluator",
            evidenceIds: ["ci-1"],
        });
        expect(gateway.promotion?.confirmation).toEqual({ version: "1.1.0", reportRevisionId: "report-2" });
        expect(gateway.block?.reason).toBe("Incident");

        const rejected = await runner.request("POST", "/repository/reevaluations", {
            kind: "commerce",
            version: "1.1.0",
            currentReportRevisionId: "report-1",
            currentDecision: { revisionId: "decision-1", digest: "a".repeat(64) },
            reason: "Injected",
            actor: "browser-controlled",
        });
        expect(rejected.status).toBe(400);
        expect(gateway.reevaluation?.reason).toBe("New evaluator");
    });

    test("sanitizes gateway responses, preserves valid retry metadata, and hides failures", async () => {
        const gateway = new RecordingGateway();
        gateway.response = new Response(JSON.stringify({ code: "limited" }), {
            status: 429,
            headers: { "retry-after": "17", "x-internal-url": "http://repository:3001" },
        });
        const runner = configuredRunner(gateway);
        const limited = await runner.request("GET", "/repository/status");
        expect(limited.status).toBe(429);
        expect(limited.headers.get("retry-after")).toBe("17");
        expect(limited.headers.get("x-internal-url")).toBeNull();
        expect(limited.headers.get("cache-control")).toBe("no-store");

        gateway.response = new Response("private upstream body", { status: 500 });
        const failed = await runner.request("GET", "/repository/status");
        expect(failed.status).toBe(503);
        expect(await failed.text()).not.toContain("private upstream body");

        gateway.failure = new Error("Bearer secret at http://repository:3001");
        const unavailable = await runner.request("GET", "/repository/status");
        expect(unavailable.status).toBe(503);
        expect(await unavailable.text()).not.toContain("Bearer secret");
    });

    test("returns 404 without a capability and rejects invalid query/body limits locally", async () => {
        const absent = new RouteRunner();
        mountRepositoryManagementRoutes(absent as unknown as Runner, undefined);
        expect((await absent.request("GET", "/repository/status")).status).toBe(404);

        const gateway = new RecordingGateway();
        const runner = configuredRunner(gateway);
        expect((await runner.request("GET", "/repository/versions")).status).toBe(400);
        expect(
            (await runner.request("GET", "/repository/compatibility?kind=commerce&version=1.0.0&limit=101")).status,
        ).toBe(400);
        const oversized = await runner.request("POST", "/repository/publications", "{}", {
            "content-length": String(33 * 1_024 * 1_024),
        });
        expect(oversized.status).toBe(413);
        expect(gateway.published).toBeUndefined();
    });
});

class RouteRunner {
    readonly routes = new Map<string, RouteHandler>();

    get(path: string, handler: RouteHandler): void {
        this.routes.set(`GET ${path}`, handler);
    }
    post(path: string, handler: RouteHandler): void {
        this.routes.set(`POST ${path}`, handler);
    }

    async request(method: "GET" | "POST", path: string, body?: unknown, headers: Record<string, string> = {}) {
        const pathname = new URL(path, "http://control.test").pathname;
        const handler = this.routes.get(`${method} ${pathname}`);
        if (!handler) {
            throw new Error(`Missing route ${method} ${pathname}`);
        }
        const serialized = typeof body === "string" ? body : body === undefined ? undefined : JSON.stringify(body);
        return await handler(
            new Request(`http://control.test${path}`, {
                method,
                body: serialized,
                headers: serialized ? { "content-type": "application/json", ...headers } : headers,
            }),
        );
    }
}

class RecordingGateway implements RepositoryManagementGateway {
    readonly calls: unknown[][] = [];
    response = Response.json({ ok: true });
    failure?: Error;
    published?: Uint8Array;
    candidate?: Uint8Array;
    reevaluation?: RepositoryReevaluationInput;
    promotion?: RepositoryStablePromotionInput;
    block?: RepositoryVersionBlockInput;

    status() {
        return this.respond("status");
    }
    diagnostics() {
        return this.respond("diagnostics");
    }
    versions(kind: string) {
        return this.respond("versions", kind);
    }
    release(kind: string, version: string) {
        return this.respond("release", kind, version);
    }
    compatibility(query: RepositoryCompatibilityQuery) {
        return this.respond("compatibility", query);
    }
    publish(document: Uint8Array) {
        this.published = document;
        return this.respond("publish");
    }
    submitCandidate(document: Uint8Array) {
        this.candidate = document;
        return this.respond("submitCandidate");
    }
    candidateStatus(candidateId: string) {
        return this.respond("candidateStatus", candidateId);
    }
    reevaluate(input: RepositoryReevaluationInput) {
        this.reevaluation = input;
        return this.respond("reevaluate");
    }
    promoteStable(input: RepositoryStablePromotionInput) {
        this.promotion = input;
        return this.respond("promoteStable");
    }
    blockVersion(input: RepositoryVersionBlockInput) {
        this.block = input;
        return this.respond("blockVersion");
    }

    private async respond(...call: unknown[]): Promise<Response> {
        this.calls.push(call);
        if (this.failure) {
            throw this.failure;
        }
        return this.response.clone();
    }
}

function configuredRunner(gateway: RepositoryManagementGateway): RouteRunner {
    const runner = new RouteRunner();
    mountRepositoryManagementRoutes(runner as unknown as Runner, {
        administratorSubjectIdentifier: "repository-owner",
        gateway,
    });
    return runner;
}
