import { describe, test, expect } from "bun:test";
import importBloc from "cms-control/api/_content/bloc/bloc.post";

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
        "script", // native HTML tag, but not allowlisted for blocs
        "BLOC-UP", // uppercase
        "1-bloc", // starts with digit
    ])("rejects dangerous tag %p with 400", async (tag) => {
        const res = await importBloc(makeReq(tag), makeSystem());
        expect(res.status).toBe(400);
    });

    test.each(["my-card", "a"])("accepts supported bloc tag %p", async (tag) => {
        const res = await importBloc(makeReq(tag), makeSystem());
        expect(res.status).toBe(200);
    });
});
