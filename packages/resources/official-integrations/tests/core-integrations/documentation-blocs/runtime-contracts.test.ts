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
});
