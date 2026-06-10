import { describe, test, expect } from "bun:test";
import postTemplate from "cms-control/api/template/template.post";
import type { TTemplate } from "@bernouy/cms-content";

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
    test("throws when identifier is missing", async () => {
        const { cms } = makeSystem();
        await expect(postTemplate(makeRequest({ name: "Hero" }), cms))
            .rejects.toThrow(/Missing param identifier/);
    });

    test("throws when name is missing", async () => {
        const { cms } = makeSystem();
        await expect(postTemplate(makeRequest({ identifier: "hero" }), cms))
            .rejects.toThrow(/Missing param name/);
    });

    test("rejects an identifier that isn't kebab-case", async () => {
        const { cms } = makeSystem();
        await expect(postTemplate(makeRequest({ identifier: "Hero Section", name: "Hero" }), cms))
            .rejects.toThrow(/identifier/);
    });

    test("happy path: persists identifier + category + default content + empty description", async () => {
        const { cms, createCalls } = makeSystem();
        const res = await postTemplate(
            makeRequest({ identifier: "hero-v1", name: "Hero", category: "landing" }),
            cms,
        );
        expect(res.ok).toBe(true);
        expect(createCalls).toHaveLength(1);
        const t = createCalls[0]!;
        expect(t.identifier).toBe("hero-v1");
        expect(t.name).toBe("Hero");
        expect(t.category).toBe("landing");
        expect(t.description).toBe("");
        expect(t.content.length).toBeGreaterThan(0);
        expect(t.createdAt).toBeInstanceOf(Date);
    });

    test("name is trimmed before persistence", async () => {
        const { cms, createCalls } = makeSystem();
        await postTemplate(makeRequest({ identifier: "hero", name: "  Hero  " }), cms);
        expect(createCalls[0]?.name).toBe("Hero");
    });

    test("category is sanitized to a string when not provided", async () => {
        const { cms, createCalls } = makeSystem();
        await postTemplate(makeRequest({ identifier: "hero", name: "Hero" }), cms);
        expect(typeof createCalls[0]?.category).toBe("string");
    });
});
