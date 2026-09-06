import type { AvailableCollection, BlocCollection, LibraryData } from "../data/model";
import { collectionLabel } from "../data/collections";
import { libraryUrl } from "../data/route";
import { element, heading, icon, button, empty, searchInput } from "./dom";

export function renderLibrary(data: LibraryData, query: string): HTMLElement {
    const root = element("section");
    root.append(
        heading(
            "Your collections",
            "A home for the blocs you build with. Choose a collection to explore its contents.",
            "BLOC LIBRARY",
        ),
    );
    const toolbar = element("div", "toolbar");
    toolbar.append(
        searchInput(query, "Search collections or blocs"),
        element("span", "result-count", `${data.collections.length} collections · ${data.blocs.length} blocs`),
    );
    root.append(toolbar);
    const groups = [
        ["site", "Created in this site", "Your reusable compositions, organised your way."],
        ["managed", "Managed collections", "Ready-to-use blocs, maintained and updated as a collection."],
        ["code", "From your codebase", "Custom blocs maintained outside the visual editor."],
    ];
    for (const [kind, title, description] of groups) {
        const collections = data.collections.filter(
            (collection) => collection.kind === kind && matchesCollection(collection, query),
        );
        if (!collections.length) {
            continue;
        }
        const section = element("section", "collection-section");
        const label = element("div", "section-heading");
        label.append(element("h2", "", title), element("p", "", description));
        const grid = element("div", "collections-grid");
        for (const collection of collections) {
            grid.append(collectionCard(collection));
        }
        section.append(label, grid);
        root.append(section);
    }
    if (!data.collections.some((collection) => matchesCollection(collection, query))) {
        root.append(empty("No collections found", "Try another name or clear your search to see every collection."));
    }
    return root;
}

export function collectionCard(collection: BlocCollection): HTMLElement {
    const card = element("a", `collection-card ${collection.kind}`);
    card.href = libraryUrl({ collection: collection.key });
    card.dataset.collectionLink = collection.key;
    const cover = element("div", "collection-cover");
    const mark = element("span", "cover-mark", collection.name.slice(0, 1).toUpperCase());
    const tiles = element("span", "cover-tiles");
    for (let index = 0; index < 3; index++) {
        tiles.append(element("span", `cover-tile tile-${index}`));
    }
    cover.append(tiles, mark, element("span", "cover-label", collectionLabel(collection)));
    const body = element("div", "collection-body");
    const title = element("div", "collection-title");
    title.append(element("h3", "", collection.name), icon("arrow"));
    body.append(title, element("p", "", collection.description));
    const footer = element("div", "collection-footer");
    footer.append(
        element("span", "", `${collection.blocs.length} ${collection.kind === "site" ? "compositions" : "blocs"}`),
    );
    if (collection.installation) {
        footer.append(element("span", "version", `v${collection.installation.definitionVersion}`));
    } else if (collection.kind === "site") {
        footer.append(element("span", "", "Editable"));
    }
    body.append(footer);
    card.append(cover, body);
    return card;
}

export function renderAdd(available: AvailableCollection[], data: LibraryData): HTMLElement {
    const root = element("section");
    root.append(
        heading(
            "Add a collection",
            "Start your own collection or bring a ready-made library into your site.",
            "GROW YOUR LIBRARY",
        ),
    );
    const own = element("section", "create-collection-card");
    const mark = element("span", "create-mark");
    mark.append(icon("plus"));
    const copy = element("div");
    copy.append(
        element("h2", "", "Make room for your own ideas"),
        element("p", "", "Create a collection and fill it with reusable compositions built in the editor."),
    );
    own.append(mark, copy, button("Create collection", "create-collection", "button primary"));
    root.append(own);
    const headingRow = element("div", "section-heading");
    headingRow.append(
        element("h2", "", "Ready-made collections"),
        element("p", "", "Add a collection first, then choose which blocs are available in the editor."),
    );
    root.append(headingRow);
    const grid = element("div", "collections-grid");
    for (const item of available) {
        const card = element("article", "available-card");
        const title = element("div", "available-title");
        title.append(element("span", "collection-avatar", item.label.slice(0, 1)), element("h3", "", item.label));
        const action = button("Add collection", "install-collection");
        action.dataset.kind = item.kind;
        card.append(
            title,
            element("p", "description", item.description),
            element("span", "badge", item.category),
            action,
        );
        grid.append(card);
    }
    for (const collection of data.collections.filter((item) => item.kind === "managed" && item.installation)) {
        const card = element("article", "available-card installed");
        const title = element("div", "available-title");
        title.append(
            element("span", "collection-avatar", collection.name.slice(0, 1)),
            element("h3", "", collection.name),
        );
        const link = element("a", "button", "Open collection");
        link.href = libraryUrl({ collection: collection.key });
        link.dataset.collectionLink = collection.key;
        card.append(
            title,
            element("p", "description", `${collection.blocs.length} blocs in your library.`),
            element("span", "badge available", "Already added"),
            link,
        );
        grid.append(card);
    }
    root.append(
        grid.children.length
            ? grid
            : empty(
                  "No collections available yet",
                  "You can create your own collection above. Managed collections appear here when they are available from your repository.",
              ),
    );
    return root;
}

function matchesCollection(collection: BlocCollection, query: string): boolean {
    const values = [
        collection.name,
        collection.description,
        ...collection.blocs.flatMap((bloc) => [bloc.name, bloc.group, bloc.tag]),
    ];
    return !query || values.some((value) => value.toLowerCase().includes(query.toLowerCase()));
}
