import type { BlocRecord } from "content/blocs/interfaces/blocs";

export function siteBlocsRevision(
    records: readonly (Pick<BlocRecord, "tag" | "ownership"> & {
        siteDefinition?: Pick<NonNullable<BlocRecord["siteDefinition"]>, "id" | "publishedRevision">;
    })[],
): string {
    return JSON.stringify(
        records
            .filter((record) => record.ownership.kind === "site-builder")
            .map((record) => siteBlocRevision(record.tag, record.siteDefinition))
            .sort(([left], [right]) => String(left).localeCompare(String(right))),
    );
}

export function siteBlocRevision(
    tag: string,
    definition: Pick<NonNullable<BlocRecord["siteDefinition"]>, "id" | "publishedRevision"> | undefined,
) {
    if (!definition?.id) {
        throw new TypeError("Stored site Bloc requires its definition identity");
    }
    return [tag, definition.id, definition.publishedRevision] as const;
}
