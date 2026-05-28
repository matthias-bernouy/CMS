import { describe, test, expect } from "bun:test";
import putTemplate from "src/control/api/template/template.put";
import type { TTemplate } from "src/socle/interfaces/models";

function makeSystem(opts: { updatedTemplate?: TTemplate | null } = {}) {
    const updateCalls: { id: string; data: Partial<TTemplate> }[] = [];
    const cms: any = {
        repository: {
            updateTemplate: async (id: string, data: Partial<TTemplate>) => {
                updateCalls.push({ id, data });
                if (opts.updatedTemplate === undefined) {
                    return { id, name: "n", description: "", content: "", category: "", createdAt: new Date(), ...data };
                }
                return opts.updatedTemplate;
            },
        },
    };
    return { cms, updateCalls };
}

function makeRequest(body: Record<string, unknown>) {
    return new Request("http://localhost/cms/api/template", {
        method: "PUT",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
    });
}

describe("PUT /api/template (update)", () => {
    test("throws when id is missing", async () => {
        const { cms } = makeSystem();
        await expect(putTemplate(makeRequest({ name: "n" }), cms))
            .rejects.toThrow(/Missing param id/);
    });

    test("throws when name is missing", async () => {
        const { cms } = makeSystem();
        await expect(putTemplate(makeRequest({ id: "tpl-1" }), cms))
            .rejects.toThrow(/Missing param name/);
    });

    test("throws when target template does not exist", async () => {
        const { cms, updateCalls } = makeSystem({ updatedTemplate: null });
        await expect(putTemplate(makeRequest({ id: "missing", name: "n" }), cms))
            .rejects.toThrow(/Unknown template id/);
        expect(updateCalls).toHaveLength(1);
    });

    test("happy path: passes update data to repository", async () => {
        const { cms, updateCalls } = makeSystem();
        const res = await putTemplate(
            makeRequest({
                id: "tpl-1",
                name: "New name",
                category: "landing",
                description: "d",
                content: "<p>c</p>",
            }),
            cms
        );
        expect(res.ok).toBe(true);
        expect(updateCalls).toHaveLength(1);
        expect(updateCalls[0]?.id).toBe("tpl-1");
        expect(updateCalls[0]?.data.name).toBe("New name");
        expect(updateCalls[0]?.data.category).toBe("landing");
    });

    test("name is trimmed before persistence", async () => {
        const { cms, updateCalls } = makeSystem();
        await putTemplate(makeRequest({ id: "tpl-1", name: "  New  " }), cms);
        expect(updateCalls[0]?.data.name).toBe("New");
    });
});
