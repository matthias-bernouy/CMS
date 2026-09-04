import { describe, expect, test } from "bun:test";
import { decodeSource, loadBloc, loadDefinition } from "./source";

describe("documentation-blocs runtime contracts", () => {
    test("registers every documentation custom element", async () => {
        const definition = await loadDefinition();

        for (const artifact of definition.artifacts) {
            if (artifact.type !== "bloc" || !artifact.bloc.path?.startsWith("blocs/foundation/documentation-blocs/")) {
                continue;
            }
            expect(decodeSource(artifact.bloc.source?.["Bloc.ts"])).toContain(
                'customElements.define("BE5_TAG_TO_BE_REPLACED", Bloc)',
            );
        }
    });

    test("keeps embeds sandboxed and rejects active non-web protocols", async () => {
        const embed = await loadBloc("doc-embed");
        const runtime = decodeSource(embed.source?.["Bloc.ts"]);
        const template = decodeSource(embed.source?.["template.html"]);

        expect(runtime).toContain('url.protocol !== "https:"');
        expect(runtime).toContain('url.protocol !== "http:"');
        expect(template).toContain(
            'sandbox="allow-forms allow-popups allow-presentation allow-same-origin allow-scripts"',
        );
        expect(template).toContain('referrerpolicy="strict-origin-when-cross-origin"');
    });

    test("removes feedback listeners when the bloc disconnects", async () => {
        const feedback = decodeSource((await loadBloc("doc-feedback")).source?.["Bloc.ts"]);

        expect(feedback).toContain('removeEventListener("click", this._voteYes)');
        expect(feedback).toContain('removeEventListener("click", this._voteNo)');
    });

    test("lets layout actions shrink without overflowing narrow viewports", async () => {
        const layout = decodeSource((await loadBloc("doc-layout")).source?.["style.css"]);
        const search = decodeSource((await loadBloc("doc-search")).source?.["style.css"]);

        expect(layout).toContain("flex: 0 1 auto;");
        expect(layout).toContain(".top-actions ::slotted(*) { min-width: 0; max-width: 100%; }");
        expect(layout).toContain("@media (max-width: 600px)");
        expect(layout).toContain(".top-links { display: none; }");
        expect(search).toContain("@media (max-width: 480px) { .shortcut { display: none; } }");
    });

    test("keeps mobile navigation accessible and visibly interactive", async () => {
        const bloc = await loadBloc("doc-layout");
        const runtime = decodeSource(bloc.source?.["Bloc.ts"]);
        const style = decodeSource(bloc.source?.["style.css"]);
        const template = decodeSource(bloc.source?.["template.html"]);

        expect(runtime).toContain('event.key === "Escape"');
        expect(runtime).toContain('setAttribute("aria-expanded"');
        expect(runtime).toContain('document.addEventListener("keydown"');
        expect(style).toContain("min-inline-size: 2.75rem;");
        expect(style).toContain("var(--topbar-fg) 70%");
        expect(style).toContain("visibility 0s linear var(--duration)");
        expect(template).toContain('aria-controls="documentation-sidebar"');
        expect(template).toContain('aria-expanded="false"');
    });

    test("clamps glossary tooltips to the current viewport", async () => {
        const glossary = await loadBloc("doc-glossary-term");
        const runtime = decodeSource(glossary.source?.["Bloc.ts"]);
        const style = decodeSource(glossary.source?.["style.css"]);

        expect(runtime).toContain("document.documentElement.clientWidth");
        expect(runtime).toContain("requestAnimationFrame(this._positionTooltip)");
        expect(runtime).toContain('--gt-viewport-shift", `${Math.round(shift)}px`');
        expect(style).toContain("translateX(calc(-50% + var(--gt-viewport-shift)))");
    });

    test("ships functional defaults for endpoint and command blocs", async () => {
        const endpoint = await loadBloc("doc-api-endpoint");
        const terminal = await loadBloc("doc-code-terminal");

        expect(decodeSource(endpoint.source?.["default.html"])).toContain('method="GET"');
        expect(decodeSource(endpoint.source?.["Bloc.ts"])).toContain('static observedAttributes = ["method"]');
        expect(decodeSource(endpoint.source?.["Bloc.ts"])).toContain("method.textContent =");
        expect(decodeSource(terminal.source?.["template.html"])).toContain('class="prompt"');
        expect(decodeSource(terminal.source?.["style.css"])).toContain(".prompt::before");
    });

    test("renders code affordances from editable light-DOM content", async () => {
        const code = await loadBloc("doc-code-block");
        const keys = await loadBloc("doc-code-kbd");
        const tabs = await loadBloc("doc-code-tabs");

        expect(decodeSource(code.source?.["template.html"])).toContain('class="line-numbers"');
        expect(decodeSource(code.source?.["Bloc.ts"])).toContain("MutationObserver");
        expect(decodeSource(keys.source?.["style.css"])).toContain("::slotted(*:not(:first-child))::before");
        expect(decodeSource(tabs.source?.["Bloc.ts"])).toContain("_onTabKeydown");
        expect(decodeSource(tabs.source?.["Bloc.ts"])).toContain("aria-selected");
        expect(decodeSource(tabs.source?.["Bloc.ts"])).toContain(`querySelector('[slot="filename"]')`);
    });

    test("restricts composed collections to their documented child blocs", async () => {
        const contracts = new Map([
            ["doc-api-params", "doc-api-property"],
            ["doc-code-tabs", "doc-code-block"],
            ["doc-steps", "doc-step"],
            ["doc-sidebar-section", "doc-sidebar-link"],
        ]);

        for (const [container, child] of contracts) {
            const editor = decodeSource((await loadBloc(container)).source?.["BlocEditor.ts"]);
            expect(editor).toContain(`"kind": "component"`);
            expect(editor).toContain(`"tag": "${child}"`);
        }
    });
});
