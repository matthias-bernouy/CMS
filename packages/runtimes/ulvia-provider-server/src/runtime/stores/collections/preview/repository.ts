import type { ContentRepository, BlocListItemResponse } from "@bernouy/content";
import { deepFreeze } from "@bernouy/ulvia-contracts/protocol";

/** Private disposable preview only: collections/Blocs are fixed while ordinary Page writes remain live. */
export function previewRepository(repository: ContentRepository, maxBytes = 8 * 1024 * 1024): ContentRepository {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
        throw new TypeError("Invalid initialization preview metadata budget");
    }
    let catalogue: BlocListItemResponse[] | undefined;
    let visible: BlocListItemResponse[] | undefined;
    let pending: Promise<BlocListItemResponse[]> | undefined;
    const load = async () => {
        const all = await repository.getBlocsList({ includeHidden: true });
        if (new TextEncoder().encode(JSON.stringify(all)).byteLength <= maxBytes) {
            deepFreeze(all);
            catalogue = all;
            visible = all.filter((bloc) => bloc.catalogue !== "hidden");
            deepFreeze(visible);
        }
        return all;
    };
    const getBlocsList: ContentRepository["getBlocsList"] = async (options, reads) => {
        if (reads || Object.keys(options ?? {}).some((key) => key !== "includeHidden")) {
            return repository.getBlocsList(options, reads);
        }
        if (catalogue) {
            return options?.includeHidden ? catalogue : visible!;
        }
        const loading = (pending ??= load());
        try {
            const all = await loading;
            return options?.includeHidden ? all : (visible ?? all.filter((bloc) => bloc.catalogue !== "hidden"));
        } finally {
            if (pending === loading) {
                pending = undefined;
            }
        }
    };
    return new Proxy(repository, {
        get(target, key) {
            if (key === "getBlocsList") {
                return getBlocsList;
            }
            const value = Reflect.get(target, key);
            return typeof value === "function" ? value.bind(target) : value;
        },
    });
}
