import type { BlocRecord } from "cms-content/blocs/interfaces/blocs";

export function siteBlocsRevision(records: readonly BlocRecord[]): string {
    return JSON.stringify(
        records
            .filter((record) => record.ownership.kind === "site-builder")
            .map((record) => [record.tag, record.siteDefinition?.publishedRevision ?? null])
            .sort(([left], [right]) => String(left).localeCompare(String(right))),
    );
}
