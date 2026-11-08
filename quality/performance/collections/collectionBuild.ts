import { buildCollectionBloc } from "@bernouy/repository/collections/build";
import { assertMaximum, benchmark, printResults } from "../benchmark";

export async function runCollectionBuildBenchmarks(): Promise<void> {
    // Synthetic modules measure source-map and import-graph compilation without a product kit.
    const source = Object.fromEntries(
        Array.from({ length: 64 }, (_, index) => [
            `modules/value${index}.ts`,
            Buffer.from(`export const value = ${index};`).toString("base64"),
        ]),
    );
    const imports = Array.from(
        { length: 64 },
        (_, index) => `import { value as v${index} } from "./modules/value${index}";`,
    );
    const sum = Array.from({ length: 64 }, (_, index) => `v${index}`).join(" + ");
    const results = [
        await benchmark("compile minimal collection Bloc", () =>
            buildCollectionBloc({
                tag: "performance-minimal",
                viewSource: 'export function mount(root) { root.dataset.ready = "true"; }',
            }),
        ),
        await benchmark("compile 64-module authored collection Bloc", () =>
            buildCollectionBloc({
                tag: "performance-modular",
                viewPath: "bloc.ts",
                source,
                viewSource: [...imports, `export function mount(root) { root.textContent = String(${sum}); }`].join(
                    "\n",
                ),
            }),
        ),
    ];
    printResults("Collection Bloc compilation", results);
    for (const result of results) {
        assertMaximum(`${result.name} p95`, result.p95Ms, 10_000);
    }
}
