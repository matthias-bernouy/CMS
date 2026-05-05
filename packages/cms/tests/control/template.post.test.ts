import { describe, test, expect } from "bun:test";
import postTemplate from "src/control/api/template/template.post";
import type { TTemplate } from "src/socle/interfaces/models";

function makeSystem() {
    const createCalls: Omit<TTemplate, "id">[] = [];
    const cms: any = {
        repository: {
            createTemplate: async (t: Omit<TTemplate, "id">) => { createCalls.push(t); },
        },
    };
    return { cms, createCalls };
}

function makeRequest(body: Record<string, unknown>) {
    return new Request("http://localhost/cms/api/template", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
    });
}

describe("POST /api/template (create)", () => {
    test("throws when name is missing", async () => {
        const { cms } = makeSystem();
        await expect(postTemplate(makeRequest({}), cms))
            .rejects.toThrow(/Missing param name/);
    });

    test("happy path: persists with category, default content, empty description", async () => {
        const { cms, createCalls } = makeSystem();
        const res = await postTemplate(
            makeRequest({ name: "Hero", category: "landing" }),
            cms
        );
        expect(res.ok).toBe(true);
        expect(createCalls).toHaveLength(1);
        const t = createCalls[0]!;
        expect(t.name).toBe("Hero");
        expect(t.category).toBe("landing");
        expect(t.description).toBe("");
        expect(t.content.length).toBeGreaterThan(0);
        expect(t.createdAt).toBeInstanceOf(Date);
    });

    test("name is trimmed before persistence", async () => {
        const { cms, createCalls } = makeSystem();
        await postTemplate(makeRequest({ name: "  Hero  " }), cms);
        expect(createCalls[0]?.name).toBe("Hero");
    });

    test("category is sanitized to a string when not provided", async () => {
        const { cms, createCalls } = makeSystem();
        await postTemplate(makeRequest({ name: "Hero" }), cms);
        expect(typeof createCalls[0]?.category).toBe("string");
    });
});
