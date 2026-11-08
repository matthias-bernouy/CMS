import { expect, test } from "bun:test";
import {
    documentReferences,
    documentUsageScanner,
    documentBlocIds,
} from "repository/collections/installations/upgrades/usage/scan";
import { parseCollectionRelease } from "repository/collections/core/parsing/parseCollectionRelease";
import { collectionDocument } from "../../fixtures";

test("repeated inventory markup retains every exact location and does not share mutable results", () => {
    const releases = [parseCollectionRelease(collectionDocument())];
    const scanner = documentUsageScanner(releases);
    const html =
        '<div cms-bloc="atlas-dofficial--atlas--panel" cms-query="ulvia/catalog:list as items">{{ cms.i18n.atlas.official/atlas.copy }}</div>';
    for (const location of ["page:one/bloc:child", "page:two/bloc:child"]) {
        const scanned = scanner.read(html, location);
        expect(scanned.references).toEqual(documentReferences(html, location, "runtime", releases));
        expect(scanned.ids).toEqual(documentBlocIds(html));
        scanned.references.length = 0;
        scanned.ids.length = 0;
    }
    expect(scanner.size).toBe(1);
    expect(
        documentUsageScanner([])
            .read(html, "foreign")
            .references.some((value) => value.type === "resource" && value.kind === "bloc"),
    ).toBe(false);
});

test("inventory scan caches have finite entry and byte budgets", () => {
    const scanner = documentUsageScanner([], 2, 1000);
    for (let index = 0; index < 4; index++) {
        scanner.read(`<p>${index}</p>`, "page:test");
    }
    expect(scanner.size).toBe(2);
    expect(scanner.retainedBytes).toBeLessThanOrEqual(1000);
    scanner.read("x".repeat(1000), "large");
    expect(scanner.size).toBe(2);
    expect(() => documentUsageScanner([], 0, 1000)).toThrow("Invalid document scan cache limits");
});
