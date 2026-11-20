import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadCollectionBlocs } from "repository/collections/tooling/authoring/blocSources";

const id = "community--guide-kit--panel";

test.each(["view.ts", "view.js", "behavior.js", "behavior.ts", "script.ts", "index.js", "view/", "behavior/"])(
    "unsupported Bloc entry %s explains the behavior source format",
    async (entry) => {
        const root = await mkdtemp(join(tmpdir(), "ulvia-bloc-sources-"));
        try {
            const bloc = join(root, id);
            await mkdir(bloc);
            await writeFile(join(bloc, "definition.json"), JSON.stringify({ id, kind: "component" }));
            await writeFile(join(bloc, "markup.html"), "<section></section>");
            if (entry.endsWith("/")) {
                await mkdir(join(bloc, entry));
            } else {
                await writeFile(join(bloc, entry), "export function mount() {}");
            }

            await expect(loadCollectionBlocs(root)).rejects.toThrow(
                `Unsupported entry in Bloc ${id}: ${entry.replace(/\/$/u, "")}. ` +
                    "Allowed files: definition.json, markup.html, style.css, bloc.ts. " +
                    "Allowed directories: settings/, runtime/. " +
                    "For component behavior, use bloc.ts exporting mount(root). " +
                    "Compositions cannot own behavior, styles or settings.",
            );
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    },
);
