import { describe, test, expect, mock } from "bun:test";

// Capture the blocId prepare_bloc receives so we can assert the handler
// rejects dangerous tags BEFORE any filesystem work happens.
const prepareBlocCalls: string[] = [];
mock.module("src/socle/blocs/prepare_bloc", () => ({
    prepare_bloc: async (
        _v: File, _e: File | null, label: string, group: string, description: string, blocId: string,
    ) => {
        prepareBlocCalls.push(blocId);
        return { id: blocId, name: label, group, description, viewJS: "", editorJS: "" };
    },
}));

const { default: importBloc } = await import("src/control/api/bloc/bloc.post");

function makeSystem() {
    return {
        repository: {
            getBlocViewJS: async () => null,
            createBloc: async (b: any) => b,
            getAllPages: async () => [],
            getAllSnippets: async () => [],
        },
        cache: { delete: () => {} },
    } as any;
}

function makeReq(tag: string) {
    const form = new FormData();
    form.append("name", "x");
    form.append("tag", tag);
    form.append("viewJS", new File(["/*v*/"], "v.js", { type: "application/javascript" }));
    return new Request("http://localhost/cms/api/bloc", { method: "POST", body: form });
}

describe("bloc.post tag validation", () => {
    test.each([
        "../../App",
        "../../../etc/passwd",
        "foo/bar",
        "bloc with space",
        "bloc;rm -rf /",
        "a",              // too short / no dash — not a valid custom element name
        "BLOC-UP",        // uppercase
        "1-bloc",         // starts with digit
    ])("rejects dangerous tag %p with 400", async (tag) => {
        prepareBlocCalls.length = 0;
        const res = await importBloc(makeReq(tag), makeSystem());
        expect(res.status).toBe(400);
        expect(prepareBlocCalls).toHaveLength(0);
    });

    test("accepts a valid custom-element tag", async () => {
        prepareBlocCalls.length = 0;
        const res = await importBloc(makeReq("my-card"), makeSystem());
        expect(res.status).toBe(200);
        expect(prepareBlocCalls).toEqual(["my-card"]);
    });
});
