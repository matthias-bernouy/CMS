import { Buffer, File } from "node:buffer";
import { resolve } from "node:path";
import { prepare_bloc } from "@bernouy/cms-bloc-compile";

export const tags = [
    "sales-client-directory",
    "sales-catalog-browser",
    "sales-proposal-list",
    "sales-proposal-starter",
    "sales-proposal-builder",
    "sales-proposal-view",
] as const;
export type SalesBlocTag = (typeof tags)[number];

const versionRoot = resolve(import.meta.dir, "../..");

export function blocPath(tag: SalesBlocTag, file: string): string {
    return resolve(versionRoot, "blocs", tag, file);
}

export function artifactPath(tag: SalesBlocTag): string {
    return resolve(versionRoot, "definitions/artifacts/blocs", `${tag}.json`);
}

export async function readBlocFile(tag: SalesBlocTag, file: string): Promise<string> {
    return Bun.file(blocPath(tag, file)).text();
}

export async function compileBloc(tag: SalesBlocTag, outputTag = `test-${tag}`) {
    const manifest = JSON.parse(await readBlocFile(tag, "manifest.json")) as {
        meta: { title: string; description: string };
    };
    const view = await readBlocFile(tag, "Bloc.ts");
    const editor = await readBlocFile(tag, "BlocEditor.ts");
    const defaultContent = await readBlocFile(tag, "default.html");
    const source =
        tag === "sales-proposal-builder" || tag === "sales-proposal-starter"
            ? Object.fromEntries(
                  await Promise.all(
                      ["formPayload.ts", "presentation.ts"].map(async (file) => [
                          file,
                          Buffer.from(await readBlocFile(tag, file)).toString("base64"),
                      ]),
                  ),
              )
            : undefined;
    return prepare_bloc(
        new File([view], "Bloc.ts", { type: "text/typescript" }),
        new File([editor], "BlocEditor.ts", { type: "text/typescript" }),
        manifest.meta.title,
        "Sales configurator",
        manifest.meta.description,
        outputTag,
        source,
        defaultContent,
    );
}

export async function defineBloc(tag: SalesBlocTag, outputTag: string): Promise<void> {
    if (customElements.get(outputTag)) {
        return;
    }
    const compiled = await compileBloc(tag, outputTag);
    new Function(compiled.viewJS)();
}

export async function settle(): Promise<void> {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();
}

export async function waitFor(predicate: () => boolean, attempts = 80): Promise<void> {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        if (predicate()) {
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error("condition was not reached");
}
