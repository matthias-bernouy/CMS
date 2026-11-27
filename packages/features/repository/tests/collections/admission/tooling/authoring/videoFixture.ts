export const heroId = "publisher--kit--hero-video";
export const videoFile = (id: string) => `/.cms/call/ulvia/cms.files/files/file_${id}/${"a".repeat(64)}`;

export function videoSource() {
    const json = (path: string, content: unknown) => ({ path, content: JSON.stringify(content) });
    return JSON.stringify({
        files: [
            json("definition.json", {
                kind: "collection",
                protocol: "ulvia-collection/v1",
                schemaDialect: "ulvia-schema/v1",
                collectionId: "publisher/kit",
                publisherId: "publisher",
                version: "1.0.0",
                name: "label",
                locale: "en",
                exports: "*",
            }),
            json("translations/en/base.json", { label: "Video hero" }),
            json(`blocs/${heroId}/definition.json`, {
                kind: "component",
                id: heroId,
                label: "label",
                description: "label",
                categories: ["label"],
                examples: ["hero"],
                defaultExample: "hero",
                root: { accepts: ["section"] },
                uses: [],
                requires: [],
                slots: {
                    heading: { accepts: [{ kind: "native-element", accepts: ["h1"] }], min: 1, max: 1 },
                    media: { accepts: [{ kind: "native-element", accepts: ["video"] }], max: 1 },
                },
            }),
            {
                path: `blocs/${heroId}/markup.html`,
                content:
                    '<div><slot name="heading"></slot><div part="player-canvas"><slot name="media"><video controls muted playsinline preload="none"></video></slot></div></div>',
            },
            json("examples/hero/definition.json", {
                id: "hero",
                label: "label",
                description: "label",
                previews: [
                    { id: "desktop", frame: { width: 1280, height: 720 } },
                    { id: "mobile", frame: { width: 390, height: 844 } },
                ],
            }),
            {
                path: "examples/hero/document.html",
                content: `<section cms-bloc="${heroId}"><h1 slot="heading">Your film</h1></section>`,
            },
        ],
    });
}

export function heroPage(film: string, cover: string) {
    return `<section cms-bloc="${heroId}"><h1 slot="heading">Our film</h1><video slot="media" src="${videoFile(film)}" poster="${videoFile(cover)}" controls muted playsinline preload="none"><track kind="captions" src="${videoFile("captions")}" srclang="en" label="English"></video></section>`;
}
