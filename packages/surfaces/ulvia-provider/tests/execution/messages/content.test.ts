import { expect, test } from "bun:test";
import { ContentValidationError } from "@bernouy/content";
import { validateExpandedPageDocument } from "@bernouy/content/page-document";
import { mountContentForTest } from "../../capabilities/content/mount";
import { DefaultProviderCapabilityDispatcher, ProviderCapabilityDispatchError } from "@bernouy/ulvia-provider";
import { officialFailure } from "../../../src/dispatch/errors/failure";
import { context as commonContext } from "./fixtures";
const context = (language: string) => commonContext(language, "1.0.1");

test("the same INVALID_PAGE code reports distinct real validation reasons without writes", async () => {
    let writes = 0;
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    await mountContentForTest(dispatcher, {
        repo: {
            insertPage: async () => {
                writes++;
            },
        },
    } as never);
    const invalid = dispatcher.invoke(
        "ulvia/cms.content",
        "pages.create",
        { path: "/draft", title: "   " },
        context("fr-CH"),
    );
    await expect(invalid).rejects.toMatchObject({
        code: "INVALID_PAGE",
        output: { message: "Le titre de la page ne peut pas être vide." },
        responseHeaders: { "content-language": "fr" },
    });
    expect(writes).toBe(0);
    const outlines = new DefaultProviderCapabilityDispatcher();
    outlines.register("ulvia/cms.content", "pages.update", async (input) => {
        try {
            validateExpandedPageDocument(String(input.html), []);
        } catch (error) {
            if (error instanceof ContentValidationError) {
                throw officialFailure("INVALID_PAGE", 422, error);
            }
            throw error;
        }
    });
    await expect(
        outlines.invoke("ulvia/cms.content", "pages.update", { html: "<h1>First</h1><h1>Second</h1>" }, context("fr")),
    ).rejects.toMatchObject({
        reason: "page.multiple_h1",
        output: { message: "La page peut afficher plusieurs titres H1. Elle doit en afficher au maximum un." },
    });
    await expect(
        outlines.invoke("ulvia/cms.content", "pages.update", { html: "<h1>First</h1><h3>Third</h3>" }, context("en")),
    ).rejects.toMatchObject({
        output: { message: "The heading hierarchy skips from H1 to H3. Add the intermediate levels." },
    });
});

test("unexpected repository TypeErrors stay technical and concurrent languages do not leak", async () => {
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    await mountContentForTest(dispatcher, {
        repo: {
            insertPage: async () => {
                throw new TypeError("private database password");
            },
        },
    } as never);
    await expect(
        dispatcher.invoke("ulvia/cms.content", "pages.create", { path: "/draft", title: "Valid" }, context("fr")),
    ).rejects.toThrow("private database password");
    const results = await Promise.allSettled(
        ["fr", "en"].map((language) =>
            dispatcher.invoke("ulvia/cms.content", "pages.create", { path: "/draft", title: "   " }, context(language)),
        ),
    );
    expect(results[0]).toMatchObject({ status: "rejected", reason: { responseHeaders: { "content-language": "fr" } } });
    expect(results[1]).toMatchObject({ status: "rejected", reason: { responseHeaders: { "content-language": "en" } } });
});

test("independent contracts retain their own error payloads and language choices", async () => {
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    const failure = new ProviderCapabilityDispatchError(
        "INVALID_TICKET",
        422,
        "Ticket rejected",
        { "content-language": "es" },
        { message: "El título es obligatorio.", reason: "title" },
    );
    dispatcher.register("example.tickets", "create", async () => {
        throw failure;
    });
    await expect(dispatcher.invoke("example.tickets", "create", {}, context("fr"))).rejects.toBe(failure);
});
