import { describe, test, expect } from "bun:test";
import importBloc from "cms-control/api/bloc/bloc.post";

function makeSystem() {
    return {
        repository: {
            getBlocViewJS: async () => null,
            createBloc: async (b: any) => b,
            getAllPages: async () => [],
        },
        cache: { delete: () => {}, deleteMatching: () => {} },
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
        const res = await importBloc(makeReq(tag), makeSystem());
        expect(res.status).toBe(400);
    });

    test("accepts a valid custom-element tag", async () => {
        const res = await importBloc(makeReq("my-card"), makeSystem());
        expect(res.status).toBe(200);
    });
});
