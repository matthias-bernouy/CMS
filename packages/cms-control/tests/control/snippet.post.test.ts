import { describe, test, expect } from "bun:test";
import postSnippet from "src/control/api/snippet/snippet.post";
import type { TSnippet } from "src/socle/interfaces/models";

function makeSystem(opts: { existingByIdentifier?: Record<string, TSnippet> } = {}) {
    const createCalls: TSnippet[] = [];
    const cms: any = {
        repository: {
            getSnippetByIdentifier: async (id: string) => opts.existingByIdentifier?.[id] ?? null,
            createSnippet: async (s: TSnippet) => { createCalls.push(s); },
        },
    };
    return { cms, createCalls };
}

function makeRequest(body: Record<string, unknown>) {
    return new Request("http://localhost/cms/api/snippet", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
    });
}

const existingHero: TSnippet = {
    id: "snippet-hero",
    identifier: "hero",
    name: "Hero",
    description: "",
    content: "",
    category: "",
    createdAt: new Date(),
    updatedAt: new Date(),
};

describe("POST /api/snippet (create)", () => {
    test("throws when identifier is missing", async () => {
        const { cms } = makeSystem();
        await expect(postSnippet(makeRequest({ name: "Hero" }), cms))
            .rejects.toThrow(/Missing param identifier/);
    });

    test("throws when name is missing", async () => {
        const { cms } = makeSystem();
        await expect(postSnippet(makeRequest({ identifier: "hero" }), cms))
            .rejects.toThrow(/Missing param name/);
    });

    test.each([
        ["Hero"],
        ["hero_section"],
        ["hero section"],
        ["-leading"],
        ["trailing-"],
        ["double--dash"],
    ])("throws on invalid kebab identifier %p", async (identifier) => {
        const { cms } = makeSystem();
        await expect(postSnippet(makeRequest({ identifier, name: "n" }), cms))
            .rejects.toThrow();
    });

    test.each([["hero"], ["hero-section"], ["a1-b2-c3"], ["x"]])(
        "succeeds on valid kebab identifier %p",
        async (identifier) => {
            const { cms, createCalls } = makeSystem();
            const res = await postSnippet(makeRequest({ identifier, name: "n" }), cms);
            expect(res.ok).toBe(true);
            expect(createCalls[0]?.identifier).toBe(identifier);
        }
    );

    test("throws when identifier already exists", async () => {
        const { cms, createCalls } = makeSystem({ existingByIdentifier: { hero: existingHero } });
        await expect(postSnippet(makeRequest({ identifier: "hero", name: "n" }), cms))
            .rejects.toThrow(/already used/);
        expect(createCalls).toHaveLength(0);
    });

    test("happy path: persists with default content, empty description, paired timestamps", async () => {
        const { cms, createCalls } = makeSystem();
        await postSnippet(
            makeRequest({ identifier: "hero", name: "Hero", category: "layout" }),
            cms
        );
        expect(createCalls).toHaveLength(1);
        const s = createCalls[0]!;
        expect(s.identifier).toBe("hero");
        expect(s.name).toBe("Hero");
        expect(s.category).toBe("layout");
        expect(s.description).toBe("");
        expect(s.content.length).toBeGreaterThan(0);
        expect(s.createdAt).toBeInstanceOf(Date);
        expect(s.updatedAt).toBeInstanceOf(Date);
        expect(s.createdAt).toBe(s.updatedAt);
    });

    test("name is trimmed before persistence", async () => {
        const { cms, createCalls } = makeSystem();
        await postSnippet(makeRequest({ identifier: "hero", name: "  Hero  " }), cms);
        expect(createCalls[0]?.name).toBe("Hero");
    });
});
