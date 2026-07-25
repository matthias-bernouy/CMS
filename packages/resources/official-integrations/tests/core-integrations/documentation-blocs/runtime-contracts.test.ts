import { describe, expect, test } from "bun:test";
import { decodeSource, loadBloc, loadDefinition } from "./source";

describe("documentation bloc runtime contracts", () => {
    test("registers every documentation custom element", async () => {
        const definition = await loadDefinition();

        for (const artifact of definition.artifacts) {
            if (artifact.type !== "bloc") {
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

    test("ships functional defaults for endpoint and command blocs", async () => {
        const endpoint = await loadBloc("doc-api-endpoint");
        const terminal = await loadBloc("doc-code-terminal");

        expect(decodeSource(endpoint.source?.["default.html"])).toContain('method="GET"');
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
