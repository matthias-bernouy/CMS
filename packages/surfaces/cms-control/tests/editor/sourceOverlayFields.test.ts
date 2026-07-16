import { describe, expect, test } from "bun:test";
import {
    InMemorySourceOverlayRepository,
    InMemorySourceRepository,
    seedSources,
    SourceOverlaySourceRepository,
} from "@bernouy/cms-sources";
import getEditorSources from "cms-control/api/editor/sources.get";
import type { ControlCms } from "cms-control/ControlCms";

type EditorSourceDto = {
    fields?: Array<{
        path: string;
        label?: string;
        type: string;
        children: EditorSourceDto["fields"];
    }>;
};

describe("GET /api/editor/sources source overlays", () => {
    test("lists overlay fields for editor bindings", async () => {
        const gateway = new InMemorySourceRepository();
        const sourceOverlays = new InMemorySourceOverlayRepository();
        await seedSources(gateway, [{
            urn: "urn:user-account",
            endpoints: [{
                urn: "urn:user-account:getAccount",
                method: "GET",
                access: { mode: "auth" },
                targetUrl: "https://api.example.com/account",
                output: [{
                    status: "200",
                    body: { type: "object", properties: { userId: { type: "string" } } },
                }],
            }],
        }]);
        await sourceOverlays.upsertOverlay({
            id: "user-account-extra-fields",
            sourceId: "user-account",
            output: [{ endpointId: "getAccount" }],
            fields: [{ id: "company", label: "Company", type: "string" }],
        });

        const response = await getEditorSources(new Request("http://admin/cms/api/editor/sources"), {
            basePath: "/cms",
            sources: new SourceOverlaySourceRepository(gateway, sourceOverlays),
        } as unknown as ControlCms);
        const body = await response.json() as EditorSourceDto[];

        expect(body[0]?.fields).toContainEqual({
            path: "metadata",
            type: "object",
            children: [{ path: "company", label: "Company", type: "string", children: [] }],
        });
    });
});
