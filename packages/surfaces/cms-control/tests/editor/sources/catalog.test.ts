import { describe, expect, test } from "bun:test";
import { InMemorySourceRepository, seedSources } from "@bernouy/cms-sources";
import getEditorSources from "cms-control/api/editor/sources.get";
import type { ControlCms } from "cms-control/ControlCms";
import type { DataField } from "@bernouy/cms-content/editor";
import { ADDRESS_PROVIDER, MIXED_PROVIDER, type EditorSourceTestDto } from "./fixtures";

describe("GET /api/editor/sources contracts", () => {
    test("lists source contracts for editor data bindings", async () => {
        const sources = new InMemorySourceRepository();
        await seedSources(sources, [ADDRESS_PROVIDER]);

        const response = await getEditorSources(new Request("http://admin/cms/api/editor/sources"), {
            basePath: "/cms",
            sources,
        } as unknown as ControlCms);
        const body = (await response.json()) as EditorSourceTestDto[];

        expect(response.status).toBe(200);
        expect(body.map((source) => source.url)).toEqual([
            "/cms/.cms/sources/address/search",
            "/cms/.cms/sources/address/reverse",
        ]);
        const searchSource = body[0]!;
        expect(searchSource.label).toBe("Address search");
        expect(searchSource.provider).toBe("address");
        expect(searchSource.providerUrn).toBe("urn:address");
        expect(searchSource.endpointUrn).toBe("urn:address:search");
        expect(searchSource.providerLabel).toBe("Address API");
        expect(searchSource.params?.every((param) => param.in === "query" || param.in === "path")).toBe(true);
        expect(searchSource.params?.some((param) => param.name === "q" && param.required === true)).toBe(true);
        const features = searchSource.fields.filter((field: DataField) => field.path === "features");
        expect(features).toHaveLength(1);
        expect(features[0]!.type).toBe("array");
        expect(features[0]!.children?.some((field) => field.path === "geometry")).toBe(true);
        expect(features[0]!.children?.some((field) => field.path === ".")).toBe(false);
    });

    test("exposes every method allowed by endpoint-picker controls", async () => {
        const sources = new InMemorySourceRepository();
        await seedSources(sources, [MIXED_PROVIDER]);

        const response = await getEditorSources(new Request("http://admin/cms/api/editor/sources"), {
            basePath: "/cms",
            sources,
        } as unknown as ControlCms);
        const body = (await response.json()) as EditorSourceTestDto[];

        expect(body.map((source) => `${source.method} ${source.url}`)).toEqual([
            "GET /cms/.cms/sources/mixed/list",
            "POST /cms/.cms/sources/mixed/create",
        ]);
        expect(body[0]!.params?.map((param) => `${param.in}:${param.name}`)).toEqual(["path:id", "query:q"]);
    });
});
