import { collectionFixture } from "../examples/buildFixture";
import { parseCollectionRelease } from "../../../../src/exports/collections";
import { collectionDocument, textDefinition } from "../../fixtures";

export const example = {
    id: "overview",
    label: "page.overview.name",
    description: "page.overview.name",
    previews: [{ id: "desktop", frame: { width: 800, height: 600 } }],
    document: {
        html: '<div cms-bloc="atlas-panel"></div>',
    },
} as const;

export { collectionFixture, collectionDocument, parseCollectionRelease, textDefinition };
