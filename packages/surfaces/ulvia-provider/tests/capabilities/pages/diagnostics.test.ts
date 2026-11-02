import { expect, test } from "bun:test";
import { InMemoryContentRepository, ValidatingContentRepository } from "@bernouy/cms-content";
import { DefaultProviderCapabilityDispatcher } from "@bernouy/ulvia-provider";
import { registerContentCapabilities } from "@bernouy/ulvia-provider/capabilities";
import { invokeHttp, resolvedContract } from "../../execution/messages/fixtures";

test("HTTP Page writes carry advisory diagnostics and declared publication failures leave state unchanged", async () => {
    const inner = new InMemoryContentRepository();
    const repo = new ValidatingContentRepository(inner);
    await inner.createBloc({
        id: "test-shell",
        name: "Shell",
        group: "Test",
        description: "Test",
        viewJS: "",
        kind: "component",
        root: { accepts: ["div"] },
        markupHTML: '<main><a href="/missing">Link</a></main>',
        ownership: { kind: "code-managed" },
    });
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    registerContentCapabilities(dispatcher, { repo } as never);
    const contract = await resolvedContract("ulvia.cms.content");
    const created = await invokeHttp(contract, dispatcher, "pages.create", {
        path: "/draft",
        title: "Draft",
        content: '<div cms-bloc="test-shell"></div>',
    });
    expect(created.status).toBe(201);
    const page = await created.json();
    expect(page.diagnostics).toContainEqual(
        expect.objectContaining({ code: "page.route_missing", severity: "warning" }),
    );
    const refused = await invokeHttp(contract, dispatcher, "pages.publish", {
        id: page.id,
        expectedRevision: page.revision,
        visible: true,
    });
    expect(refused.status).toBe(422);
    expect(await refused.json()).toMatchObject({
        error: {
            code: "INVALID_PAGE",
            output: { diagnostics: [expect.objectContaining({ code: "page.route_missing", severity: "error" })] },
        },
    });
    expect(await inner.getPageById(page.id)).toMatchObject({ visible: false, revision: page.revision });
    expect(await inner.getPageById(page.id)).not.toHaveProperty("diagnostics");
});

test("publication preserves the expanded HTML error code and its Bloc location", async () => {
    const inner = new InMemoryContentRepository();
    await inner.createBloc({
        id: "test-shell",
        name: "Shell",
        group: "Test",
        description: "Test",
        viewJS: "",
        kind: "component",
        root: { accepts: ["main"] },
        markupHTML: "<main>Nested main</main>",
        ownership: { kind: "code-managed" },
    });
    await inner.insertPage("/draft", "Draft", '<main cms-bloc="test-shell"></main>');
    const page = (await inner.getPage("/draft"))!;
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    registerContentCapabilities(dispatcher, { repo: new ValidatingContentRepository(inner) } as never);
    const response = await invokeHttp(await resolvedContract("ulvia.cms.content"), dispatcher, "pages.publish", {
        id: page.id,
        expectedRevision: page.revision,
        visible: true,
    });
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("INVALID_PAGE");
    expect(body.error.output.diagnostics).toContainEqual(
        expect.objectContaining({
            code: "page.main_nested",
            location: expect.objectContaining({ blocId: "test-shell" }),
        }),
    );
});

test("the effective-link budget returns a corrective diagnostic without creating a Page", async () => {
    const inner = new InMemoryContentRepository();
    await inner.createBloc({
        id: "test-link-budget",
        name: "Link budget",
        group: "Test",
        description: "Test",
        viewJS: "",
        kind: "component",
        root: { accepts: ["div"] },
        ownership: { kind: "code-managed" },
        markupHTML: `<main>${'<a href="/target">Target</a>'.repeat(257)}</main>`,
    });
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    registerContentCapabilities(dispatcher, { repo: new ValidatingContentRepository(inner) } as never);
    const response = await invokeHttp(await resolvedContract("ulvia.cms.content"), dispatcher, "pages.create", {
        path: "/link-budget",
        title: "Link budget",
        content: '<div cms-bloc="test-link-budget"></div>',
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
        error: {
            code: "INVALID_PAGE",
            output: {
                diagnostics: [
                    expect.objectContaining({
                        code: "page.links_budget",
                        severity: "error",
                        suggestion: expect.any(String),
                    }),
                ],
            },
        },
    });
    expect(await inner.getPage("/link-budget")).toBeNull();
});
