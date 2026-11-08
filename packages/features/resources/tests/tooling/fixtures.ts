import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { compileImplementations } from "@bernouy/ulvia-sdk/build";
import { defineFeature, defineCapability, implementFeature, contractString, z } from "@bernouy/ulvia-sdk";

export async function sourceFixture() {
    const root = await mkdtemp(join(tmpdir(), "ulvia-resource-source-"));
    const write = async (path: string, value: string | object) => {
        await mkdir(dirname(join(root, path)), { recursive: true });
        await Bun.write(join(root, path), typeof value === "string" ? value : JSON.stringify(value));
    };
    const definition = {
        format: "ulvia-resource-source/v1",
        namespace: "acme/base",
        locale: "en",
        states: [] as unknown[],
    };
    const bloc = {
        id: "acme--base--card",
        kind: "component",
        name: "card.name",
        group: "group.base",
        description: "card.description",
        root: { accepts: ["div"] },
        slots: {},
    };
    const folder = "blocs/cards/acme--base--card/";
    await write("definition.json", definition);
    await write(folder + "definition.json", bloc);
    await write(folder + "markup.html", "<slot></slot>");
    await write(
        folder + "bloc.ts",
        'throw new Error("AUTHORED MODULE MUST NOT EXECUTE DURING BUILD"); export function mount(root) { root.dataset.ready = "yes"; }',
    );
    await write("translations/en/base.json", {
        "card.name": "Card",
        "card.description": "A card",
        "group.base": "Base",
        "page.title": "Home",
        "page.description": "Home page",
    });
    await write("translations/fr/base.json", {
        "card.name": "Carte",
        "card.description": "Une carte",
        "group.base": "Base",
        "page.title": "Accueil",
        "page.description": "Page d’accueil",
    });
    await write("pages/home/definition.json", {
        path: "/",
        title: "page.title",
        description: "page.description",
        visible: true,
        indexing: true,
    });
    await write("pages/home/document.html", '<div cms-bloc="acme--base--card"></div>');
    await write("assets/hello.txt", "Hello");
    return { root, write, definition, bloc, folder, close: () => rm(root, { recursive: true, force: true }) };
}
export async function sourceContracts() {
    const feature = defineFeature({
        contractId: "acme/query",
        publisherId: "acme",
        name: "Source query",
        version: "1.0.0",
        capabilities: [
            defineCapability({
                id: "read",
                access: "public",
                behavior: { effect: "query", execution: "sync", sensitive: false },
                input: z.strictObject({}),
                output: z.strictObject({ value: contractString({ maxLength: 8 }) }),
                errors: {},
                bindings: [{ id: "mcp", transport: "mcp", tool: { name: "source_read" } }],
                execute() {
                    throw new Error("Build must not call a capability");
                },
            }),
        ],
    });
    return compileImplementations([
        implementFeature(feature, {
            services: () => {
                throw new Error("Build must not construct services");
            },
        }),
    ]);
}
