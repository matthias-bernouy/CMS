import { describe, expect, test } from "bun:test";
import { InMemoryCmsRepository } from "@bernouy/cms-content";
import { seedFoundationBlocs } from "cms-control/core/editorSystemV2/seedFoundationBlocs";

describe("foundation bloc seeding", () => {
    test("imports foundation components as real repository blocs", async () => {
        const repository = new InMemoryCmsRepository();
        const created = await seedFoundationBlocs(repository);
        const list = await repository.getBlocsList();

        expect(created.sort()).toEqual([
            "base-card",
            "base-container",
            "base-grid",
            "base-photo-album",
            "base-skeleton",
        ]);
        expect(list.map(bloc => bloc.id).sort()).toEqual(created.sort());

        const js = await repository.getBlocsJS();
        const photoAlbum = js.find(bloc => bloc.id === "base-photo-album");
        expect(photoAlbum?.viewJS).toContain("customElements.define");
        expect(photoAlbum?.editorJS).toContain("window.p9rEditor.registerEditor");
        expect(photoAlbum?.editorJS).toContain("Photo album");

        const source = await repository.getBlocSource("base-photo-album");
        expect(source?.["manifest.json"]).toBeString();
        expect(Buffer.from(source!["manifest.json"]!, "base64").toString("utf-8")).toContain(`"runtime": "foundation"`);
        expect(Buffer.from(source!["Bloc.ts"]!, "base64").toString("utf-8")).toContain("export class PhotoAlbum");
        expect(Buffer.from(source!["BlocEditor.ts"]!, "base64").toString("utf-8")).toContain("export class PhotoAlbumEditor");
        expect(Buffer.from(source!["BlocEditor.ts"]!, "base64").toString("utf-8")).not.toContain("/home/");
        expect(Buffer.from(source!["BlocEditor.ts"]!, "base64").toString("utf-8")).not.toContain("./options");
        expect(source?.["template.html"]).toBeString();
        expect(source?.["style.css"]).toBeString();
        expect(source?.["options.ts"]).toBeUndefined();

        const skeletonSource = await repository.getBlocSource("base-skeleton");
        expect(Buffer.from(skeletonSource!["manifest.json"]!, "base64").toString("utf-8")).toContain(`"default-tag": "base-skeleton"`);
        expect(Buffer.from(skeletonSource!["Bloc.ts"]!, "base64").toString("utf-8")).toContain("export class Skeleton");
        expect(Buffer.from(skeletonSource!["BlocEditor.ts"]!, "base64").toString("utf-8")).toContain("export class SkeletonEditor");
    });

    test("does not overwrite existing repository blocs", async () => {
        const repository = new InMemoryCmsRepository();
        await repository.createBloc({
            id: "base-card",
            name: "Custom card",
            group: "Custom",
            description: "User-owned card.",
            viewJS: "window.customCard = true;",
            editorJS: "window.customCardEditor = true;",
        });

        const created = await seedFoundationBlocs(repository);
        const card = await repository.getBlocViewJS("base-card");
        const list = await repository.getBlocsList();

        expect(created).not.toContain("base-card");
        expect(card).toBe("window.customCard = true;");
        expect(list.find(bloc => bloc.id === "base-card")?.name).toBe("Custom card");
    });

});
