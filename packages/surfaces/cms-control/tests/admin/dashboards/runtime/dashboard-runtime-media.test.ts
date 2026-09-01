import { afterEach, describe, expect, test } from "bun:test";
import type { DashboardDto } from "@bernouy/cms-dashboards";
import { detailKey } from "../../../../src/components/admin/Resources/Dashboards/domain";
import { executeDashboardMediaAction } from "../../../../src/components/admin/Resources/Dashboards/runtime/actions";
import type { DashboardSourceGroup } from "../../../../src/components/admin/Resources/Dashboards/types";
import { runDashboardMediaAction } from "../../../../src/components/admin/Resources/Dashboards/view/actions";
import { setupDashboardActionTests } from "../../widgets/dashboard-table-actions/setup";

const realFetch = globalThis.fetch;

setupDashboardActionTests();

afterEach(() => {
    globalThis.fetch = realFetch;
});

describe("dashboard nested media actions", () => {
    test("uploads a list card image and maps the endpoint result to its file endpoint", async () => {
        const requests: Request[] = [];
        globalThis.fetch = (async (input, init) => {
            const request = new Request(input, init);
            requests.push(request);
            return request.method === "GET"
                ? Response.json({ ref: "question-ref", options: [] })
                : Response.json({ ok: true, mediaId: 101 });
        }) as typeof fetch;

        const result = await executeDashboardMediaAction(
            group(),
            dashboard(),
            { collection: "questionDetail", row: "question-ref" },
            {
                action: "upload",
                field: "imageOptions",
                rowKey: "question-ref",
                itemField: "image",
                itemIndex: 0,
                itemKey: "warm",
                itemPath: "image",
                parentItem: { key: "warm", label: "Warm" },
                value: [],
                files: [new File(["image"], "warm.png", { type: "image/png" })],
            },
            { imageOptions: [{ key: "warm", label: "Warm" }] },
        );

        expect(result).toMatchObject({ handled: true, nested: true, item: { id: "101" } });
        expect(result.item?.url).toContain("/.cms/sources/forms/choiceImage?id=101");
        expect(requests.map((request) => request.method)).toEqual(["GET", "POST"]);
        expect(requests[1]?.url).toContain("uploadChoiceImage?ref=question-ref");
        expect((await requests[1]!.formData()).get("file")).toBeInstanceOf(File);
    });

    test("patches a nested media card without discarding other unsaved fields", async () => {
        globalThis.fetch = (async (input, init) => {
            const request = new Request(input, init);
            return request.method === "GET"
                ? Response.json({ ref: "question-ref", options: [] })
                : Response.json({ ok: true, mediaId: 101 });
        }) as typeof fetch;
        const widget = document.createElement("section");
        const root = widget.attachShadow({ mode: "open" });
        const control = document.createElement("div") as HTMLDivElement & {
            data: { items: Record<string, unknown>[] };
        };
        control.dataset.fieldControl = "imageOptions";
        control.data = {
            items: [
                { key: "cool", label: "Cool", image: { id: "202", url: "/cool" } },
                { key: "warm", label: "Warm", image: { id: "local:1", url: "blob:local" } },
            ],
        };
        root.append(control);
        const key = detailKey("questionDetail", "question-ref");
        const drafts = new Map([
            [
                key,
                {
                    type: "choice",
                    presentation: "image-grid",
                    imageOptions: structuredClone(control.data.items),
                },
            ],
        ]);
        let renders = 0;

        await runDashboardMediaAction(
            {
                group: group(),
                dashboard: dashboard(),
                detail: { collection: "questionDetail", row: "question-ref" },
                drafts,
                render: () => {
                    renders += 1;
                },
                reload: () => {},
                clearDetail: () => {},
                openDetail: () => {},
            },
            {
                action: "upload",
                field: "imageOptions",
                rowKey: "question-ref",
                itemField: "image",
                itemIndex: 0,
                itemKey: "warm",
                itemPath: "image",
                parentItem: structuredClone(control.data.items[0]),
                value: [{ id: "local:1", url: "blob:local" }],
                files: [new File(["image"], "warm.png", { type: "image/png" })],
            },
            widget,
        );

        expect(renders).toBe(0);
        expect(drafts.get(key)).toMatchObject({
            type: "choice",
            presentation: "image-grid",
            imageOptions: [{ image: { id: "202" } }, { image: { id: "101" } }],
        });
        expect(control.data.items).toMatchObject([{ image: { id: "202" } }, { image: { id: "101" } }]);
    });
});

function dashboard(): DashboardDto {
    return {
        id: "forms",
        source: "forms",
        views: [
            {
                widget: "w-detail",
                id: "questionDetail",
                source: { endpoint: "manageQuestion", params: { ref: "$selection.id" } },
                main: [
                    {
                        id: "choices",
                        title: "Choices",
                        fields: [
                            {
                                id: "imageOptions",
                                label: "Images",
                                path: "options",
                                type: "reorderable-list",
                                itemKey: "key",
                                fields: [
                                    {
                                        id: "image",
                                        label: "Image",
                                        path: "image",
                                        type: "media",
                                        item: { idPath: "mediaId", urlPath: "url", altPath: "alt" },
                                        actions: {
                                            upload: {
                                                endpoint: "uploadChoiceImage",
                                                params: { ref: "$resource.ref" },
                                            },
                                        },
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
        ],
    };
}

function group(): DashboardSourceGroup {
    return {
        source: {
            urn: "urn:forms",
            id: "forms",
            name: "Forms",
            endpointCount: 2,
            dashboardCount: 1,
            readonly: false,
        },
        endpoints: [
            {
                endpointId: "manageQuestion",
                method: "GET",
                targetUrl: "https://forms.test/question",
                params: [{ name: "ref", in: "query", type: "string" }],
            },
            {
                endpointId: "uploadChoiceImage",
                method: "POST",
                targetUrl: "https://forms.test/image",
                params: [{ name: "ref", in: "query", type: "string" }],
            },
        ],
        dashboards: [],
    };
}
