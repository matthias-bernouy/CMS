import { describe, expect, test } from "bun:test";
import { EditablePageDocument } from "../../../packages/official-repository/collections/ulvia-official/blocs/admin/pages/ulvia-official-page-editor/runtime/document";
import { EditorFrame } from "../../../packages/official-repository/collections/ulvia-official/blocs/admin/pages/ulvia-official-page-editor/runtime/frame";
import { heading } from "./fixtures";

describe("EditorFrame", () => {
    test("maps authored components onto the retained public Page roots", () => {
        const source = new EditablePageDocument(
            '<section cms-bloc="fixture-section"><h2 cms-bloc="ulvia-official-heading" slot="heading">Authored</h2></section>',
        );
        const iframe = document.createElement("iframe");
        const highlight = document.createElement("span");
        document.body.append(iframe, highlight);
        iframe.contentDocument!.body.innerHTML =
            '<div cms-bloc="fixture-section"><h2 cms-bloc="ulvia-official-heading" part="heading">Expanded</h2></div>';
        const section = {
            ...heading,
            id: "fixture-section",
            authoringJson: JSON.stringify({ root: { accepts: ["section"] }, slots: {} }),
        };
        const frame = new EditorFrame(
            iframe,
            highlight,
            () => undefined,
            () => undefined,
        );

        frame.map(source, [section, heading]);

        expect(frame.contentValue(source.elements()[1]!, "", 0)).toBe("Authored");
        frame.updateContent(source.elements()[1]!, "", 0, "Updated");
        expect(iframe.contentDocument!.querySelector("h2")?.textContent).toBe("Updated");
        iframe.remove();
        highlight.remove();
    });

    test("skips generated components with another identity", () => {
        const source = new EditablePageDocument('<article cms-bloc="fixture-card">Card</article>');
        const iframe = document.createElement("iframe");
        const highlight = document.createElement("span");
        document.body.append(iframe, highlight);
        iframe.contentDocument!.body.innerHTML =
            '<h2 cms-bloc="ulvia-official-heading">Generated</h2><article cms-bloc="fixture-card">Expanded card</article>';
        const card = {
            ...heading,
            id: "fixture-card",
            authoringJson: JSON.stringify({ root: { accepts: ["article"] }, slots: {} }),
        };
        const frame = new EditorFrame(
            iframe,
            highlight,
            () => undefined,
            () => undefined,
        );

        frame.map(source, [card, heading]);

        expect(frame.contentValue(source.elements()[0]!, "", 0)).toBe("Expanded card");
        iframe.remove();
        highlight.remove();
    });

    test("selects a component clicked inside the iframe realm", () => {
        const source = new EditablePageDocument('<h2 cms-bloc="ulvia-official-heading">Authored</h2>');
        const iframe = document.createElement("iframe");
        const highlight = document.createElement("span");
        document.body.append(iframe, highlight);
        iframe.contentDocument!.body.innerHTML = '<h2 cms-bloc="ulvia-official-heading">Rendered</h2>';
        let selected: HTMLElement | null = null;
        const frame = new EditorFrame(
            iframe,
            highlight,
            (element) => {
                selected = element;
            },
            () => undefined,
        );

        frame.connect();
        frame.map(source, [heading]);
        iframe.contentDocument!.querySelector("h2")?.click();

        expect(selected).toBe(source.elements()[0]);
        frame.disconnect();
        iframe.remove();
        highlight.remove();
    });
});
