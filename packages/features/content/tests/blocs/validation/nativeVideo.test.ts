import { expect, test } from "bun:test";
import { validateBlocContentMarkup, validateBlocDocument, validatePageDocument } from "@bernouy/content/page-document";

const file = `/.cms/call/ulvia/cms.files/files/file_video/${"a".repeat(64)}`;
const fixed = (html: string) => validateBlocContentMarkup(html, { field: "markupHTML", kind: "fixed" }).html;
const hero = {
    id: "fixture-hero",
    kind: "component" as const,
    root: { accepts: ["div" as const] },
    slots: {
        media: { accepts: [{ kind: "native-element" as const, accepts: ["video" as const] }], max: 1 },
    },
};

test("native video accepts controlled attributes, sources and subtitle tracks", () => {
    expect(
        fixed('<div part="player-canvas"><video controls muted playsinline preload="none"></video></div>'),
    ).toContain("<video");
    expect(
        fixed(
            `<video src="${file}" poster="${file}" controls muted loop playsinline autoplay preload="metadata" width="640" height="360"><track src="${file}" srclang="en" label="English" default></video>`,
        ),
    ).toContain("<track");
    expect(fixed(`<video controls><source src="${file}" type="video/mp4"></video>`)).toContain("<source");
    expect(
        fixed(
            '<video src="{{ film | internalUrl }}" poster="{{ cover | internalUrl }}" autoplay="{{ enabled }}" controls="{{ native }}" muted="{{ silent }}"></video>',
        ),
    ).toContain("{{ film | internalUrl }}");
    const html = `<div cms-bloc="fixture-hero"><video slot="media" src="${file}" controls><track src="${file}" srclang="fr"></video></div>`;
    expect(validatePageDocument(html, [hero]).html).toContain(file);
    expect(() =>
        validatePageDocument(html, [
            { ...hero, slots: { media: { accepts: [{ kind: "native-content", profile: "prose" }] } } },
        ]),
    ).toThrow("does not accept native <video>");
    const player = {
        id: "fixture-player",
        kind: "component" as const,
        root: { accepts: ["video" as const] },
        slots: {},
        fixedContent: `<track src="${file}" srclang="en">`,
    };
    expect(validateBlocDocument(player, []).fixedContent).toContain("<track");
});

test.each([
    ['<video autoplay="false"></video>', "boolean attribute"],
    ['<video onplay="alert(1)"></video>', "onplay"],
    ['<video src="javascript:alert(1)"></video>', "forbidden URL"],
    ['<video poster="data:image/png;base64,AA"></video>', "CMS file"],
    ['<video src="https://outside.test/a.mp4"></video>', "CMS file"],
    ['<video src="//outside.test/a.mp4"></video>', "CMS file"],
    ['<video src="{{ film }}"></video>', "internalUrl"],
    ['<video poster="/prefix/{{ film | internalUrl }}"></video>', "one complete"],
    ['<video src="{{ cms.asset.publisher/kit.film.mp4 }}"></video>', "internalUrl"],
    ['<video controls="false"></video>', "boolean attribute"],
    ['<video muted="false"></video>', "boolean attribute"],
    ['<video preload="eager"></video>', "preload"],
    ['<video width="-1"></video>', "positive integer"],
    ['<video data-cms-poster="{{ cover }}"></video>', "forbidden"],
    [`<track src="${file}" srclang="en">`, "direct child"],
    ['<video><track srclang="en"></video>', "non-empty source"],
    [`<video><track src="${file}"></video>`, "require srclang"],
    [`<video><track src="${file}" kind="unknown"></video>`, "kind"],
    [`<video><track src="${file}" srclang="not_a_locale"></video>`, "language tag"],
    ['<video><source src="https://outside.test/a.mp4"></video>', "CMS file"],
    ["<video><video></video></video>", "another <video>"],
])("native video refuses uncontrolled media: %s", (markup, message) => {
    expect(() => fixed(markup)).toThrow(message);
});
