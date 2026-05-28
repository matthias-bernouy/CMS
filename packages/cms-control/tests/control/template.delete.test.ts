import { describe, test, expect } from "bun:test";
import deleteTemplate from "src/control/api/template/template.delete";

function makeSystem() {
    const deleteCalls: string[] = [];
    const cms: any = {
        repository: {
            deleteTemplate: async (id: string) => { deleteCalls.push(id); },
        },
    };
    return { cms, deleteCalls };
}

function makeRequest(query: Record<string, string>) {
    const url = new URL("http://localhost/cms/api/template");
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    return new Request(url.toString(), { method: "DELETE" });
}

describe("DELETE /api/template", () => {
    test("400 when id missing", async () => {
        const { cms, deleteCalls } = makeSystem();
        const res = await deleteTemplate(makeRequest({}), cms);
        expect(res.status).toBe(400);
        expect(deleteCalls).toHaveLength(0);
    });

    test("happy path: forwards id to repository and returns 200", async () => {
        const { cms, deleteCalls } = makeSystem();
        const res = await deleteTemplate(makeRequest({ id: "tpl-1" }), cms);
        expect(res.status).toBe(200);
        expect(deleteCalls).toEqual(["tpl-1"]);
    });
});
