import { InMemoryContentRepository, type ContentRepository, type TPage } from "@bernouy/cms-content";

export function syntheticCorpus(pageCount: number) {
    const base = new InMemoryContentRepository();
    let scans = 0;
    let largestScan = 0;
    const repository = new Proxy(base, {
        get(target, property) {
            if (property === "scanPages") {
                return async (cursor: string | undefined, limit: number) => {
                    const start = cursor === undefined ? 0 : Number(cursor.slice("page-".length)) + 1;
                    const length = Math.min(limit, Math.max(0, pageCount - start));
                    const pages = Array.from({ length }, (_, offset) => page(start + offset));
                    scans++;
                    largestScan = Math.max(largestScan, length);
                    return { pages, ...(start + length < pageCount ? { nextCursor: pages.at(-1)!.id } : {}) };
                };
            }
            const value = Reflect.get(target, property);
            return typeof value === "function" ? value.bind(target) : value;
        },
    }) as ContentRepository;
    return {
        repository,
        reset() {
            scans = 0;
            largestScan = 0;
        },
        metrics: () => ({ scans, largestScan }),
    };
}

function page(index: number): TPage {
    const id = `page-${String(index).padStart(8, "0")}`;
    return {
        id,
        revision: 1,
        path: `/${id}`,
        content: '<div cms-bloc="performance-suite-card-0"></div>',
        title: id,
        description: "",
        visible: false,
        tags: [],
    };
}
