import type { BlocRecord, SiteBlocDefinition } from "content/blocs/interfaces/blocs";

export function siteBlocsRevision(
    records: readonly (Pick<BlocRecord, "tag" | "ownership"> & {
        readonly siteDefinition?: Pick<SiteBlocDefinition, "publishedRevision">;
    })[],
): string {
    return JSON.stringify(
        records
            .filter((record) => record.ownership.kind === "site-builder")
            .map((record) => [record.tag, record.siteDefinition?.publishedRevision ?? null])
            .sort(([left], [right]) => String(left).localeCompare(String(right))),
    );
}
