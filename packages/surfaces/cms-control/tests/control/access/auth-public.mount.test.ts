import { describe, expect, spyOn, test } from "bun:test";
import { InMemoryCmsRepository } from "@bernouy/cms-content";
import { InMemoryAuthentication } from "@bernouy/cms-auth";
import { CompositeSourceRepository, InMemorySourceRepository, SYSTEM_SOURCES } from "@bernouy/cms-sources";
import { InMemoryRolesRepository } from "@bernouy/cms-permissions";
import { ControlCms } from "cms-control/ControlCms";
import type { CMS_ROLES } from "types/roles";
import { authSystem, CaptureRunner, mountedSourceHandler } from "./authPublicSupport";

describe("Control public auth mount", () => {
    test("mounts public auth routes unguarded and disables signup", async () => {
        const runner = CaptureRunner.withoutFileApi();
        const repository = new InMemoryCmsRepository();
        const { local, credentials, users, publicAuth } = authSystem();
        const cms = new ControlCms(
            runner,
            repository,
            local,
            { publicAuth },
            undefined,
            undefined,
            undefined,
            undefined,
            users,
            undefined,
            undefined,
            credentials,
            undefined,
            undefined,
            new InMemoryRolesRepository(),
            { local },
        );
        await cms.ready;

        expect(runner.endpoints.get("POST /.cms/auth/login")).toBe(0);
        expect(runner.endpoints.has("POST /.cms/auth/signup")).toBe(false);
    });

    test("keeps system-auth signup disabled through the guarded Control gateway", async () => {
        const runner = CaptureRunner.withoutFileApi();
        const repository = new InMemoryCmsRepository();
        const { local, credentials, users, publicAuth } = authSystem();
        const gateway = new CompositeSourceRepository(new InMemorySourceRepository(), SYSTEM_SOURCES);
        const adminAuth = new InMemoryAuthentication<CMS_ROLES>({ role: "admin" });
        const cms = new ControlCms(
            runner,
            repository,
            adminAuth,
            { publicAuth },
            undefined,
            undefined,
            undefined,
            undefined,
            users,
            undefined,
            undefined,
            credentials,
            gateway,
            undefined,
            new InMemoryRolesRepository(),
            { local },
        );
        await cms.ready;

        const gatewayPost = runner.handlers.get("POST /.cms/sources");
        expect(gatewayPost).toBeDefined();

        const res = await gatewayPost!(
            new Request("http://control/.cms/sources/system-auth/signup", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ email: "ada@example.com", password: "password-1" }),
            }),
        );

        expect(res.status).toBe(404);
        expect(await credentials.getByEmail("ada@example.com")).toBeNull();
    });

    test("propagates the Control subject role to computed source values", async () => {
        const runner = CaptureRunner.withoutFileApi();
        const sources = new InMemorySourceRepository();
        await sources.createSource({
            urn: "urn:operator-context",
            endpoints: [
                {
                    urn: "urn:operator-context:current",
                    method: "GET",
                    access: { mode: "admin" },
                    targetUrl: "https://operator.test/context",
                    input: {
                        params: [
                            {
                                name: "role",
                                in: "query",
                                required: true,
                                source: { from: "computed", ref: "userRole" },
                                schema: { type: "string" },
                            },
                        ],
                    },
                    output: [{ status: "200", body: { type: "object" } }],
                },
            ],
        });
        const cms = new ControlCms(
            runner,
            new InMemoryCmsRepository(),
            new InMemoryAuthentication<CMS_ROLES>({ role: "admin" }),
            {},
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            sources,
            undefined,
            new InMemoryRolesRepository(),
        );
        await cms.ready;

        const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ ok: true }));
        try {
            const handler = runner.handlers.get("GET /.cms/sources");
            expect(handler).toBeDefined();
            const response = await handler!(new Request("http://control/.cms/sources/operator-context/current"));

            expect(response.status).toBe(200);
            expect(fetchSpy.mock.calls[0]![0]).toBe("https://operator.test/context?role=admin");
        } finally {
            fetchSpy.mockRestore();
        }
    });

    test("ignores removed endpoint role metadata and preserves the admin bypass", async () => {
        const sources = new InMemorySourceRepository();
        await sources.createSource({
            urn: "urn:operator-actions",
            endpoints: [
                {
                    urn: "urn:operator-actions:refund",
                    method: "POST",
                    access: { mode: "admin", roles: ["legacy-role"] } as any,
                    targetUrl: "https://operator.test/refund",
                    output: [{ status: "200", body: { type: "object" } }],
                },
            ],
        });
        const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ ok: true }));
        try {
            const admin = await mountedSourceHandler("admin", sources);
            const allowed = await admin(
                new Request("http://control/.cms/sources/operator-actions/refund", { method: "POST" }),
            );
            expect(allowed.status).toBe(200);
            expect(fetchSpy).toHaveBeenCalledTimes(1);

            const legacy = await mountedSourceHandler("legacy-role", sources);
            const denied = await legacy(
                new Request("http://control/.cms/sources/operator-actions/refund", { method: "POST" }),
            );
            expect(denied.status).toBe(403);
            expect(fetchSpy).toHaveBeenCalledTimes(1);
        } finally {
            fetchSpy.mockRestore();
        }
    });
});
