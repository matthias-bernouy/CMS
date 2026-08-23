import { describe, expect, test } from "bun:test";
import { InMemoryFunctionRepository, withFunctionsSource } from "@bernouy/cms-functions";
import {
    CompositeSourceRepository,
    InMemorySourceRepository,
    seedSources,
    SYSTEM_AUTH_SOURCE,
    SYSTEM_SITE_ORGANIZATION_ENDPOINT_URN,
    SYSTEM_SITE_SOURCE,
    SYSTEM_SOURCES,
    type Source,
    type SourceEndpointAccessMode,
} from "@bernouy/cms-sources";
import getEditorSources from "cms-control/api/editor/sources.get";
import type { ControlCms } from "cms-control/ControlCms";
import { DIRECT_CATALOG_SOURCE, type EditorSourceTestDto } from "./fixtures";

describe("GET /api/editor/sources access", () => {
    test("returns only public and authenticated endpoints", async () => {
        const sources = new InMemorySourceRepository();
        await seedSources(sources, [accessSource()]);

        const body = await listEditorSources(sources);

        expect(body.map((source) => source.endpointUrn)).toEqual(["urn:access:public", "urn:access:auth"]);
    });

    test("keeps the public system authentication actions authorable", async () => {
        const sources = new CompositeSourceRepository(new InMemorySourceRepository(), [SYSTEM_AUTH_SOURCE]);

        const body = await listEditorSources(sources);

        expect(SYSTEM_AUTH_SOURCE.endpoints.every((endpoint) => endpoint.access?.mode === "public")).toBe(true);
        expect(body.map((source) => source.endpointUrn)).toEqual(
            SYSTEM_AUTH_SOURCE.endpoints.map((endpoint) => endpoint.urn),
        );
        const login = body.find((source) => source.endpointUrn === "urn:system-auth:login");
        expect(login).toMatchObject({
            provider: "system-auth",
            providerUrn: "urn:system-auth",
            providerLabel: "Authentication",
            label: "Log in",
            method: "POST",
        });
        expect(login?.body?.fields).toEqual([
            { path: "email", type: "string", required: true },
            { path: "password", type: "string", required: true },
            { path: "returnTo", type: "string" },
        ]);
    });

    test("exposes the site organization as a public editor source", async () => {
        const sources = new CompositeSourceRepository(new InMemorySourceRepository(), SYSTEM_SOURCES);

        const body = await listEditorSources(sources);
        const organization = body.find((source) => source.endpointUrn === SYSTEM_SITE_ORGANIZATION_ENDPOINT_URN);

        expect(SYSTEM_SITE_SOURCE.endpoints[0]?.access?.mode).toBe("public");
        expect(organization).toMatchObject({
            provider: "system-site",
            providerUrn: "urn:system-site",
            providerLabel: "Site",
            label: "Organization",
            method: "GET",
            url: "/cms/.cms/sources/system-site/organization",
        });
        expect(organization?.fields.map((field) => field.path)).toEqual([
            "name",
            "legalName",
            "description",
            "logo",
            "email",
            "telephone",
            "address",
            "sameAs",
        ]);
    });

    test("applies the same boundary to projected functions", async () => {
        const functions = new InMemoryFunctionRepository();
        await Promise.all([
            functions.createFunction(cmsFunction("publicFunction", "public")),
            functions.createFunction(cmsFunction("authFunction", "auth")),
            functions.createFunction(cmsFunction("adminFunction", "admin")),
            functions.createFunction(cmsFunction("systemFunction", "system")),
            functions.createFunction(cmsFunction("implicitAdminFunction")),
        ]);
        const sources = withFunctionsSource(new InMemorySourceRepository(), functions);

        const body = await listEditorSources(sources);

        expect(body.map((source) => source.endpointUrn)).toEqual([
            "urn:system-functions:publicFunction",
            "urn:system-functions:authFunction",
        ]);
    });

    test("keeps injected direct routes when sources are not configured", async () => {
        const response = await getEditorSources(new Request("http://admin/cms/api/editor/sources"), {
            get sources(): never {
                throw new Error("sources repository not configured");
            },
            editorDataSources: [DIRECT_CATALOG_SOURCE, DIRECT_CATALOG_SOURCE],
        } as unknown as ControlCms);

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual([DIRECT_CATALOG_SOURCE]);
    });
});

async function listEditorSources(sources: ControlCms["sources"]): Promise<EditorSourceTestDto[]> {
    const response = await getEditorSources(new Request("http://admin/cms/api/editor/sources"), {
        basePath: "/cms",
        sources,
    } as unknown as ControlCms);
    return response.json() as Promise<EditorSourceTestDto[]>;
}

function accessSource(): Source {
    return {
        urn: "urn:access",
        endpoints: [
            endpoint("public", "public"),
            endpoint("auth", "auth"),
            endpoint("admin", "admin"),
            endpoint("system", "system"),
            endpoint("implicit-admin"),
        ],
    };
}

function endpoint(id: string, mode?: SourceEndpointAccessMode): Source["endpoints"][number] {
    return {
        urn: `urn:access:${id}`,
        method: "GET",
        targetUrl: `https://api.example.com/${id}`,
        output: [{ status: "200", body: { type: "object" } }],
        ...(mode ? { access: { mode } } : {}),
    };
}

function cmsFunction(id: string, mode?: SourceEndpointAccessMode) {
    return {
        id,
        method: "POST" as const,
        steps: [],
        return: {},
        ...(mode ? { access: { mode } } : {}),
    };
}
