import type { BlocListItemResponse } from "@bernouy/cms-content";
import type { BuiltBloc } from "../build";
import { bundleBlocSource } from "cms-cli/push/blocs/bundle";

/**
 * Filesystem-backed bloc store. Reads from a shared `built` map populated
 * up-front by `CLI_dev` and mutated in place by the file watcher: when a
 * bloc rebuilds, the new bundle replaces the old entry and subsequent
 * repo calls see it instantly. The shared map IS the cache; "invalidation"
 * is just the watcher swapping a value.
 *
 * Writes (`createBloc` / `replaceBloc`) are NOT supported in dev — the
 * authoring source files ARE the data; you edit `Bloc.ts` directly. The
 * repo throws so an admin UI accidentally hitting POST /api/bloc fails
 * loud rather than silently dropping work.
 */
export class BlocsStore {
    constructor(private readonly built: Map<string, BuiltBloc>) {}

    async getAllJS(): Promise<{ id: string; editorJS: string; viewJS: string }[]> {
        return [...this.built.values()].map(b => ({
            id: b.tag, editorJS: b.editorJS ?? "", viewJS: b.viewJS,
        }));
    }

    async getList(): Promise<BlocListItemResponse[]> {
        return [...this.built.values()].map(b => ({
            id: b.tag, name: b.label, group: b.group, description: b.description,
        }));
    }

    async getViewJS(tag: string): Promise<string | null> {
        return this.built.get(tag)?.viewJS ?? null;
    }

    async getSource(tag: string): Promise<Record<string, string> | null> {
        const folder = this.built.get(tag)?.folder;
        if (!folder) return null;
        return await bundleBlocSource(folder);
    }

    /** Dev-mode only: bloc creation goes through editing source files + push. */
    rejectWrite(): never {
        throw new Error("Bloc create/replace is not supported in `p9r dev` — edit the source files under site/blocs/ and use `p9r push --type=blocs` to deploy.");
    }
}
