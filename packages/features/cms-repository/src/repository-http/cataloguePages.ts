const MAX_CATALOGUE_PAGES = 1_024;
const MAX_CATALOGUE_ENTRIES = 262_144;

export type RepositoryCataloguePage<Entry> = Readonly<{
    entries: readonly Entry[];
    nextCursor?: string;
}>;

/** Consume an untrusted cursor catalogue with global loop, duplicate and memory bounds. */
export async function readCataloguePages<Entry>(
    fetchPage: (cursor: string | undefined) => Promise<RepositoryCataloguePage<Entry>>,
    coordinate: (entry: Entry) => string,
    label: string,
): Promise<Entry[]> {
    const entries: Entry[] = [];
    const coordinates = new Set<string>();
    const cursors = new Set<string>();
    let cursor: string | undefined;
    for (let pageNumber = 0; pageNumber < MAX_CATALOGUE_PAGES; pageNumber++) {
        const page = await fetchPage(cursor);
        for (const entry of page.entries) {
            const key = coordinate(entry);
            if (coordinates.has(key)) {
                throw new TypeError(`Duplicate ${label} release coordinates across pages`);
            }
            coordinates.add(key);
            entries.push(entry);
            if (entries.length > MAX_CATALOGUE_ENTRIES) {
                throw new TypeError(`${label} repository catalogue is too large`);
            }
        }
        if (!page.nextCursor) {
            return entries;
        }
        if (page.entries.length === 0 || cursors.has(page.nextCursor)) {
            throw new TypeError(`${label} repository catalogue cursor loop`);
        }
        cursors.add(page.nextCursor);
        cursor = page.nextCursor;
    }
    throw new TypeError(`${label} repository catalogue has too many pages`);
}
