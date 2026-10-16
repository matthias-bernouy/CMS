import { InMemoryCmsRepository, type CmsRepository, type TPage } from "@bernouy/cms-content";

type CorpusMetrics = {
    scans: number;
    largestScan: number;
    largestChangeBatch: number;
    peakHeapBytes: number;
};

export function syntheticCorpus(pageCount: number, affectedPercent: 1 | 10 | 100) {
    const base = new InMemoryCmsRepository();
    let metrics: CorpusMetrics = emptyMetrics();
    const repository = new Proxy(base, {
        get(target, property) {
            if (property === "scanPages") {
                return async (cursor: string | undefined, limit: number) => {
                    const start = cursor === undefined ? 0 : Number(cursor.slice("page-".length)) + 1;
                    const length = Math.min(limit, Math.max(0, pageCount - start));
                    const pages = Array.from({ length }, (_, offset) => page(start + offset, affectedPercent));
                    metrics.scans += 1;
                    metrics.largestScan = Math.max(metrics.largestScan, pages.length);
                    observeHeap();
                    return {
                        pages,
                        ...(start + length < pageCount && pages.length ? { nextCursor: pages.at(-1)!.id } : {}),
                    };
                };
            }
            const value = Reflect.get(target, property);
            return typeof value === "function" ? value.bind(target) : value;
        },
    }) as CmsRepository;
    return {
        repository,
        reset() {
            metrics = emptyMetrics();
        },
        observeChanges(length: number) {
            metrics.largestChangeBatch = Math.max(metrics.largestChangeBatch, length);
            observeHeap();
        },
        metrics: () => ({ ...metrics }),
    };

    function observeHeap(): void {
        metrics.peakHeapBytes = Math.max(metrics.peakHeapBytes, process.memoryUsage().heapUsed);
    }
}

export function affectedCount(pageCount: number, affectedPercent: 1 | 10 | 100): number {
    return Math.ceil(pageCount / (100 / affectedPercent));
}

export function migrationRelease(version: string, blocId: string): Record<string, unknown> {
    return {
        kind: "collection",
        protocol: "ulvia-collection/v1",
        schemaDialect: "ulvia-schema/v1",
        collectionId: "performance-migration",
        publisherId: "ulvia.performance",
        version,
        name: "collection.name",
        locale: "en",
        translations: { en: { "collection.name": "Performance migration", "bloc.label": "Panel" } },
        assets: [],
        blocs: [
            {
                kind: "component",
                root: { accepts: ["div"] },
                id: blocId,
                label: "bloc.label",
                template: "<div></div>",
                uses: [],
                requires: [],
                slots: {},
            },
        ],
    };
}

function page(index: number, affectedPercent: 1 | 10 | 100): TPage {
    const id = `page-${String(index).padStart(8, "0")}`;
    return {
        id,
        revision: 1,
        path: `/${id}`,
        content: isAffected(index, affectedPercent) ? '<div cms-bloc="performance-migration-card"></div>' : "",
        title: `Page ${index}`,
        description: "",
        visible: false,
        tags: [],
    };
}

function isAffected(index: number, affectedPercent: 1 | 10 | 100): boolean {
    return index % (100 / affectedPercent) === 0;
}

function emptyMetrics(): CorpusMetrics {
    return { scans: 0, largestScan: 0, largestChangeBatch: 0, peakHeapBytes: 0 };
}
