import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { collectionAssetRepresentationVersion } from "@bernouy/cms-repository/collections";
import { parseHTML } from "linkedom";
import { blocPreview } from "cms-control/core/content/bloc/preview/render";
import { seedBloc, siteBlocHarness } from "../../site-blocs/fixtures";

test("bloc previews resolve installed collection assets against public Delivery", async () => {
    const { repository } = siteBlocHarness();
    const bytes = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}` as const;
    const asset = { id: "mark.svg", mediaType: "image/svg+xml", byteLength: bytes.byteLength, digest };
    await seedBloc(repository, "asset-card", {
        viewJS: 'const previewAsset = "{{ cms.asset.design-system.mark.svg }}";',
        source: {
            "manifest.json": btoa(JSON.stringify({ defaultContent: "default.html" })),
            "default.html": btoa(
                '<asset-card><img alt="Mark" src="{{ cms.asset.design-system.mark.svg }}"></asset-card>',
            ),
        },
    });
    const release = {
        kind: "collection" as const,
        protocol: "ulvia-collection/v1" as const,
        schemaDialect: "ulvia-schema/v1" as const,
        collectionId: "design-system",
        publisherId: "ulvia.official",
        version: "1.0.0",
        dataGeneration: 1,
        name: "collection.name",
        locale: "en",
        translations: { en: { "collection.name": "Design system" } },
        assets: [asset],
        blocs: [],
        migrations: [],
    };
    const previewRepository = {
        getBlocRecords: () => repository.getBlocRecords(),
        getSystem: () => repository.getSystem(),
        getInstalledCollections: async () => ({
            revision: 1,
            collections: [
                {
                    collectionId: "design-system",
                    digest: "sha256:release",
                    configuration: {},
                    textOverrides: {},
                    release,
                },
            ],
        }),
    };
    const response = await blocPreview(previewRepository, "asset-card", "/cms", {
        scripts: [],
        style: "",
        collectionAssetBaseUrl: "http://delivery.test:5101",
    });
    const html = await response.text();
    const version = await collectionAssetRepresentationVersion(asset);
    const url = `http://delivery.test:5101/.cms/collections/design-system/assets/mark.svg?v=${version}`;

    expect(parseHTML(html).document.querySelector("img")?.getAttribute("src")).toBe(url);
    expect(html).toContain(`const previewAsset = \"${url}\";`);
    expect(response.headers.get("content-security-policy")).toContain("http://delivery.test:5101");
    expect(html).not.toContain("cms.asset.design-system.mark.svg");
});
