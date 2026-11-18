import { expect, test } from "bun:test";
import { createCmsSiteBloc, publishCmsSiteBloc } from "@bernouy/content";
import type { SiteBlocNode } from "@bernouy/content";
import { parseHTML } from "linkedom";
import { artifact, pages, reproductionSite } from "./fixture";

test("authored sources admit reusable structures without site editorial assets or copy", async () => {
    expect(artifact.release.blocs).toHaveLength(7);
    expect(artifact.release.assets.map(({ id }) => id)).toEqual(["mark.svg"]);
    expect(JSON.stringify(artifact.release)).not.toMatch(/Cedar|file_fixture_portrait|\/#workshops/);
    expect(artifact.release.blocs.every((bloc) => bloc.kind === "component" && bloc.defaultExample)).toBe(true);
    const { repository, local } = await reproductionSite();
    expect(await local.getBlocRecord("example--studio--section")).toBeNull();
    expect((await repository.getBlocRecord("site-cedar-header"))?.ownership.kind).toBe("site-builder");
    for (const page of pages) {
        expect((await repository.getPage(page.path))?.content).not.toContain("Cedar Learning</a>");
    }
});

function rename(nodes: SiteBlocNode[]) {
    for (const node of nodes) {
        if (node.kind === "text" && node.value === "Workshops") {
            node.value = "Training dates";
        }
        if (node.kind === "bloc") {
            rename(node.children);
        }
    }
}

test("one published site composition edit reaches three Pages without changing their documents", async () => {
    const { repository, storage, render } = await reproductionSite();
    const installed = await storage.readSite("site");
    const before = await Promise.all(pages.map(({ path }) => repository.getPage(path)));
    const header = (await repository.getBlocRecord("site-cedar-header"))!.siteDefinition!;
    const draft = structuredClone(header.draft);
    rename(draft.structure);
    const saved = await repository.saveSiteBlocDraft(header.tag, draft, header.draftRevision);
    await publishCmsSiteBloc(repository, { tag: saved.tag, revision: saved.draftRevision });
    for (const page of pages) {
        const document = await render(page.path);
        expect(document.querySelector("header nav")?.textContent).toContain("Training dates");
        expect(document.querySelector("header a[href='/#workshops']")).not.toBeNull();
        expect(document.querySelectorAll("h1")).toHaveLength(1);
    }
    expect(await Promise.all(pages.map(({ path }) => repository.getPage(path)))).toEqual(before);
    expect(await storage.readSite("site")).toEqual(installed);
});

test("Page heading, link, image and repeated content edits require no new collection release", async () => {
    const { repository, storage, render } = await reproductionSite();
    const installed = await storage.readSite("site");
    const otherPage = await repository.getPage("/about");
    const page = (await repository.getPage("/"))!;
    const { document } = parseHTML(`<html><body>${page.content}</body></html>`);
    document.querySelector("h1")!.textContent = "Learn together";
    const image = document.querySelector("img")!;
    image.setAttribute("src", `/.cms/call/ulvia/cms.files/files/file_replacement/${"b".repeat(64)}`);
    image.setAttribute("alt", "Our new facilitator");
    const section = document.querySelector("#workshops")!;
    const [first, second] = Array.from(section.querySelectorAll("article"));
    const added = first!.cloneNode(true) as Element;
    added.querySelector("h3")!.textContent = "New format";
    const action = document.createElement("a");
    action.setAttribute("slot", "actions");
    action.setAttribute("href", "/workshops#new-format");
    action.textContent = "Discover this format";
    added.append(action);
    section.append(added, first!);
    second!.remove();
    document.querySelector("main")!.prepend(section);
    await repository.updatePage({ id: page.id, content: document.body.innerHTML }, page.revision);
    const rendered = await render("/");
    expect(rendered.querySelector("h1")?.textContent).toBe("Learn together");
    expect(rendered.querySelector("img")?.getAttribute("alt")).toBe("Our new facilitator");
    expect(rendered.querySelector("img")?.getAttribute("src")).toContain("file_replacement");
    expect(Array.from(rendered.querySelectorAll("article h3"), (heading) => heading.textContent)).toEqual([
        "New format",
        "Team workshop",
    ]);
    expect(rendered.querySelector("article a")?.getAttribute("href")).toBe("/workshops#new-format");
    expect(rendered.querySelector("main > section")?.id).toBe("workshops");
    expect(await repository.getPage("/about")).toEqual(otherPage);
    expect(await storage.readSite("site")).toEqual(installed);
});

test("semantic composition and component-slot refusals leave stored content unchanged", async () => {
    const { repository, local } = await reproductionSite();
    const created = await createCmsSiteBloc(repository, {
        tag: "site-fixed-heading",
        name: "Fixed heading",
        group: "Site",
        content: "<h2>Fixed heading</h2>",
    });
    const before = await local.getBlocsList({ includeHidden: true });
    await expect(
        publishCmsSiteBloc(repository, {
            tag: created.tag,
            revision: created.draftRevision,
        }),
    ).rejects.toThrow("explicit heading Bloc");
    expect(await local.getBlocsList({ includeHidden: true })).toEqual(before);
    await expect(
        repository.insertPage(
            "/invalid",
            "Invalid",
            '<main cms-bloc="example--studio--main"><div slot="content" cms-bloc="site-cedar-header"></div></main>',
        ),
    ).rejects.toThrow();
    expect(await repository.getPage("/invalid")).toBeNull();
});
