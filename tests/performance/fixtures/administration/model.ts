import { createHash } from "node:crypto";
import type { CollectionRelease } from "@bernouy/repository/collections";

/** Retain the complete library and assets; replace only proposed Page content in explicit controls. */
export function administrationControls(release: CollectionRelease): CollectionRelease {
    const recipe = release.bootstraps!.find(({ id }) => id === "administration")!;
    return {
        ...release,
        version: "1.19.0-performance.0",
        examples: [
            ...release.examples!,
            {
                id: "performance-control",
                label: recipe.label,
                description: recipe.description,
                document: { html: '<h1 cms-bloc="ulvia--mossa--heading">Performance control</h1>' },
                previews: [{ id: "desktop", frame: { width: 1440, height: 900 } }],
                requires: [],
            },
        ].toSorted((left, right) => left.id.localeCompare(right.id)),
        bootstraps: [
            ...release.bootstraps!,
            ...[0, 1, 21].map((count) => ({
                ...recipe,
                id: `performance-${count}`,
                pages: recipe.pages.slice(0, count).map((page) => ({ ...page, exampleId: "performance-control" })),
            })),
        ],
    };
}

export function canonicalDigest(canonicalJson: string) {
    return `sha256:${createHash("sha256").update(canonicalJson).digest("hex")}` as const;
}
