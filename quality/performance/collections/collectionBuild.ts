import { join } from "node:path";
import { buildCollectionBloc, type CollectionBlocBuildInput } from "@bernouy/cms-repository/collections/build";
import { assertMaximum, benchmark, printResults } from "../benchmark";

const BLOC_ROOT = join(import.meta.dir, "../../../packages/official-repository/collections/ulvia-official/blocs");

export async function runCollectionBuildBenchmarks(): Promise<void> {
    const colorInput = await blocSource("forms/fields/ulvia-official-color-input", "ulvia-official-color-input");
    const pageEditor = await blocSource("admin/pages/ulvia-official-page-editor", "ulvia-official-page-editor");
    const results = [
        await benchmark("compile minimal collection Bloc", () =>
            buildCollectionBloc({
                tag: "performance-minimal",
                viewSource:
                    'export default class extends HTMLElement { connectedCallback() { this.dataset.ready = "true"; } }',
            }),
        ),
        await benchmark("compile official color input Bloc", () => buildCollectionBloc(colorInput)),
        await benchmark("compile official Page editor Bloc", () => buildCollectionBloc(pageEditor)),
    ];
    printResults("Collection Bloc compilation", results);
    for (const result of results) {
        assertMaximum(`${result.name} p95`, result.p95Ms, 10_000);
    }
}

async function blocSource(relativeRoot: string, tag: string): Promise<CollectionBlocBuildInput> {
    const root = join(BLOC_ROOT, relativeRoot);
    const viewSource = await Bun.file(join(root, "bloc.ts")).text();
    const source: Record<string, string> = {};
    const glob = new Bun.Glob("**/*");
    for await (const path of glob.scan({ cwd: root, onlyFiles: true })) {
        if (path !== "bloc.ts") {
            source[path] = Buffer.from(await Bun.file(join(root, path)).bytes()).toString("base64");
        }
    }
    return { tag, viewSource, viewPath: "bloc.ts", source };
}
