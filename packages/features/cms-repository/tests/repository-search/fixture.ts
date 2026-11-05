import type { RepositorySearchRow } from "../../src/repository/search/interfaces";
import { searchRow } from "../../src/repository/search/sources/rows";
export const digest = `sha256:${"a".repeat(64)}`;
export function row(
    id = "example.official/shop",
    description = "Product card with price",
    version = "1.0.0",
    blocId?: string,
): RepositorySearchRow {
    return searchRow(
        { kind: "collection", publisherId: "example.official", id, version, digest },
        id,
        description,
        [],
        ["example.commerce"],
        "",
        blocId,
    );
}
export function source(rows = [row()]) {
    let revision = "one";
    return {
        load: async () => ({ revision, rows }),
        replace(next: RepositorySearchRow[]) {
            rows = next;
            revision += "+";
        },
    };
}
