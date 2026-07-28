import { afterEach, describe, expect, test } from "bun:test";
import type { Authentication, Subject } from "@bernouy/cms-auth";
import { BunRunner } from "@bernouy/http-runner";
import {
    mountCmsRepositoryManagementGateway,
    type RepositoryManagementGatewayRequest,
} from "@bernouy/cms-repository-management/gateway";

let runner: BunRunner | undefined;

afterEach(async () => {
    await runner?.stopGracefully(1_000);
    runner = undefined;
});

describe("CMS repository management gateway", () => {
    test("requires a current CMS administrator before forwarding", async () => {
        const fixture = startGateway();

        expect((await fetch(fixture.url("/api/status"), { redirect: "manual" })).status).toBe(401);
        expect((await request(fixture.url("/api/status"), "user-pat")).status).toBe(403);
        expect(fixture.forwarded).toHaveLength(0);

        const response = await request(fixture.url("/api/status"), "admin-pat");
        expect(response.status).toBe(200);
        expect(fixture.forwarded).toEqual([
            {
                actor: "cms-admin-1",
                method: "GET",
                path: "/api/status",
                query: "",
            },
        ]);
    });

    test("forwards only the ordinary allowlist and strips upstream secret headers", async () => {
        const fixture = startGateway(() =>
            Response.json(
                { ok: true },
                {
                    headers: {
                        "retry-after": "7",
                        "set-cookie": "repository-secret=1",
                        "x-internal-secret": "hidden",
                    },
                },
            ),
        );

        const allowed = await request(fixture.url("/api/integrations/versions?kind=commerce"), "admin-pat");
        expect(allowed.status).toBe(200);
        expect(allowed.headers.get("retry-after")).toBe("7");
        expect(allowed.headers.get("set-cookie")).toBeNull();
        expect(allowed.headers.get("x-internal-secret")).toBeNull();
        expect(fixture.forwarded[0]).toMatchObject({
            actor: "cms-admin-1",
            path: "/api/integrations/versions",
            query: "?kind=commerce",
        });

        expect((await request(fixture.url("/api/integrations/schema-baselines"), "admin-pat")).status).toBe(404);
        expect((await request(fixture.url("/api/integrations/verification-jobs"), "admin-pat")).status).toBe(404);
        expect((await request(fixture.url("/api/status"), "admin-pat", { method: "POST" })).status).toBe(404);
        expect(fixture.forwarded).toHaveLength(1);
    });

    test("preserves canonical candidate bytes and injects the authenticated mutation actor", async () => {
        const fixture = startGateway();
        const candidate = '{"schema":"candidate","value":"é"}';
        const candidateResponse = await request(fixture.url("/api/integrations/candidates"), "other-admin-pat", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: candidate,
        });
        expect(candidateResponse.status).toBe(200);
        expect(new TextDecoder().decode(fixture.forwarded[0]?.body)).toBe(candidate);
        expect(fixture.forwarded[0]).toMatchObject({ actor: "cms-admin-2", contentType: "application/json" });

        const mutationResponse = await request(fixture.url("/api/integrations/stable-promotions"), "other-admin-pat", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ actor: "forged-actor", kind: "commerce" }),
        });
        expect(mutationResponse.status).toBe(200);
        expect(JSON.parse(new TextDecoder().decode(fixture.forwarded[1]?.body))).toEqual({
            actor: "cms-admin-2",
            kind: "commerce",
        });
    });
});

function startGateway(
    respond: (request: RepositoryManagementGatewayRequest) => Response = () => Response.json({ ok: true }),
) {
    const forwarded: RepositoryManagementGatewayRequest[] = [];
    runner = new BunRunner();
    mountCmsRepositoryManagementGateway({
        runner,
        authentication: new PatAuthentication(),
        requiredRole: "admin",
        transport: {
            async forward(input) {
                forwarded.push(input);
                return respond(input);
            },
        },
    });
    runner.start(0);
    const origin = `http://127.0.0.1:${runner.port}`;
    return {
        forwarded,
        url: (path: string) => `${origin}/.cms/repository-management${path}`,
    };
}

function request(url: string, token: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${token}`);
    return fetch(url, { ...init, headers, redirect: "manual" });
}

class PatAuthentication implements Authentication<"admin" | "user"> {
    readonly loginUrl = "/login";
    readonly logoutUrl = "/logout";
    readonly profileUrl = "/profile";

    buildLoginUrl(returnTo: string): string {
        return `/login?returnTo=${encodeURIComponent(returnTo)}`;
    }

    buildLogoutUrl(returnTo: string): string {
        return `/logout?returnTo=${encodeURIComponent(returnTo)}`;
    }

    async getSubject(request: Request): Promise<Subject<"admin" | "user"> | null> {
        const token = request.headers.get("authorization")?.replace(/^Bearer /u, "");
        if (token === "admin-pat") {
            return { identifier: "cms-admin-1", role: "admin" };
        }
        if (token === "other-admin-pat") {
            return { identifier: "cms-admin-2", role: "admin" };
        }
        return token === "user-pat" ? { identifier: "cms-user-1", role: "user" } : null;
    }
}
