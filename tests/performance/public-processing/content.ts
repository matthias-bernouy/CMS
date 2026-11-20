import { createHash } from "node:crypto";
import { parseHTML } from "linkedom";
import { createBlocUsageResolver } from "@bernouy/content";
import { renderContentTexts, renderPageDocument } from "@bernouy/content/rendering";
import { measure } from "./measure";
import { inventory, views, usageHtml, expectedTags, textHtml, pageHtml } from "./fixture";

const digest = (text: string) => createHash("sha256").update(text).digest("hex");
export async function contentMeasurements() {
    let viewReads = 0;
    const repository = {
        getRenderableBlocs: async () => inventory,
        getBlocViewJS: async (tag: string) => {
            viewReads++;
            return views[tag] ?? null;
        },
    };
    const usage = await measure(
        "bloc-dependencies:200-catalogue:20-used:two-passes",
        () => undefined,
        async () => {
            viewReads = 0;
            const resolve = createBlocUsageResolver(inventory, repository);
            return [await resolve(usageHtml), await resolve(usageHtml)];
        },
        (output) => {
            if (JSON.stringify(output) !== JSON.stringify([expectedTags, expectedTags]) || viewReads !== 20) {
                throw new Error("Dependency output or view operation count changed");
            }
        },
    );
    const textIdentity = digest(parseHTML(`<html><body>${textHtml}</body></html>`).document.body.innerHTML);
    const texts = await measure(
        "server-texts:1500-static-nodes",
        () => parseHTML(`<html><body>${textHtml}</body></html>`).document.body,
        (body) => {
            renderContentTexts(body, "en", []);
            return body;
        },
        (body) => {
            if (digest(body.innerHTML) !== textIdentity) {
                throw new Error("Text bytes changed");
            }
        },
    );
    let renderedIdentity: string | undefined;
    const render = await measure(
        "document-render:200-catalogue:20-cards:500-paragraphs",
        () => parseHTML("<html><body></body></html>").document.body,
        (body) =>
            renderPageDocument(
                body,
                { html: pageHtml },
                { repository, language: "en", resolveContributedAssets: async (html) => html },
            ),
        (output) => {
            const current = digest(
                JSON.stringify([output.html, output.referencedTags, output.usedTags, output.requiresBindingRuntime]),
            );
            renderedIdentity ??= current;
            if (current !== renderedIdentity || JSON.stringify(output.usedTags) !== JSON.stringify(expectedTags)) {
                throw new Error("Rendered document changed within run");
            }
        },
    );
    return {
        measurements: [usage, texts, render],
        identities: { textIdentity, renderedIdentity },
        counts: { viewsPerDependencyResolution: 20 },
    };
}
