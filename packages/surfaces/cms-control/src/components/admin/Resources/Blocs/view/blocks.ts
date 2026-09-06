import { route } from "../../Integrations/api";
import { collectionLabel } from "../data/collections";
import { libraryUrl } from "../data/route";
import type { BlocCollection, BlocItem } from "../data/model";
import { button, element, empty, heading, icon, searchInput } from "./dom";

export type BlocFilters = { query: string; group: string; state: string; limit: number };
export type AvailabilityView = { resources: Map<string, string>; selected: Set<string>; dirty: number };

export function renderCollection(
    collection: BlocCollection,
    filters: BlocFilters,
    availability?: AvailabilityView,
): HTMLElement {
    const root = element("section");
    const crumb = element("nav", "breadcrumb");
    crumb.setAttribute("aria-label", "Breadcrumb");
    const back = element("a", "", "All collections");
    back.href = libraryUrl();
    back.dataset.collectionLink = "";
    crumb.append(back, element("span", "", "/"), element("span", "", collection.name));
    const header = heading(collection.name, collection.description, collectionLabel(collection));
    if (collection.kind === "site") {
        header.append(button("New composition", "create-composition", "button primary"));
    } else if (collection.installation?.integrationType === "collection") {
        header.append(button("Check for updates", "check-updates"));
    }
    root.append(crumb, header);
    const toolbar = element("div", "toolbar");
    toolbar.append(searchInput(filters.query, "Search blocs"));
    toolbar.append(
        selectFilter("group", "Category", filters.group, [
            ["", "All categories"],
            ...[...new Set(collection.blocs.map((bloc) => bloc.group).filter(Boolean))]
                .sort()
                .map((group) => [group, group]),
        ]),
    );
    toolbar.append(
        selectFilter(
            "state",
            "Visibility",
            filters.state,
            collection.kind === "site"
                ? [
                      ["", "All statuses"],
                      ["published", "Published"],
                      ["draft", "Draft"],
                      ["archived", "Archived"],
                  ]
                : [
                      ["", "All blocs"],
                      ["available", "Available"],
                      ["hidden", "Hidden"],
                  ],
        ),
    );
    const blocs = collection.blocs.filter((bloc) => matchesBloc(bloc, filters, availability));
    toolbar.append(
        element("span", "result-count", `${blocs.length} ${collection.kind === "site" ? "compositions" : "blocs"}`),
    );
    root.append(toolbar);
    if (!blocs.length) {
        const blank = empty(
            collection.blocs.length ? "No matching blocs" : "Your collection starts here",
            collection.blocs.length
                ? "Try another search or category to find the bloc you need."
                : "Create your first composition, then reuse it wherever you need it.",
        );
        if (!collection.blocs.length && collection.kind === "site") {
            blank.append(button("New composition", "create-composition", "button primary"));
        }
        root.append(blank);
    } else {
        const grid = element("div", "blocs-grid");
        for (const bloc of blocs.slice(0, filters.limit)) {
            grid.append(blocCard(bloc, collection, availability));
        }
        root.append(grid);
        if (blocs.length > filters.limit) {
            const more = element("div", "load-more");
            more.append(button(`Show more (${blocs.length - filters.limit} remaining)`, "load-more"));
            root.append(more);
        }
    }
    return root;
}

function blocCard(bloc: BlocItem, collection: BlocCollection, availability?: AvailabilityView): HTMLElement {
    const card = element("article", "bloc-card");
    card.dataset.bloc = bloc.tag;
    const preview = blocLink(bloc, "bloc-preview");
    preview.setAttribute("aria-label", bloc.editable ? `Edit ${bloc.name}` : `Preview ${bloc.name}`);
    const blank = bloc.editable && !bloc.directDependencies.length;
    if (blank) {
        const placeholder = element("span", "blank-preview");
        placeholder.append(icon("plus"), element("span", "", "Empty composition"));
        preview.append(placeholder);
    } else {
        const frame = element("iframe", "preview-frame");
        frame.title = `${bloc.name} preview`;
        frame.tabIndex = -1;
        frame.setAttribute("aria-hidden", "true");
        frame.setAttribute("sandbox", "allow-scripts");
        frame.dataset.previewSrc = route(`/api/bloc/preview?id=${encodeURIComponent(bloc.tag)}`);
        preview.append(frame);
    }
    preview.append(element("span", "preview-open", bloc.editable ? "Open in editor ↗" : "Explore bloc ↗"));
    const body = element("div", "bloc-card-body");
    const title = blocLink(bloc, "bloc-name");
    title.textContent = bloc.name;
    body.append(title, element("p", "bloc-description", bloc.description || "A reusable bloc for your pages."));
    const footer = element("div", "bloc-footer");
    footer.append(element("span", "bloc-category", bloc.group || collection.name));
    const resource = availability?.resources.get(bloc.tag);
    if (resource) {
        const toggle = element("label", "availability-toggle");
        const input = element("input");
        input.type = "checkbox";
        input.setAttribute("role", "switch");
        input.setAttribute("aria-label", `Make ${bloc.name} available in the editor`);
        input.checked = availability!.selected.has(resource);
        input.dataset.resource = resource;
        toggle.append(element("span", "", input.checked ? "Available" : "Hidden"), input);
        footer.append(toggle);
    } else {
        footer.append(
            element(
                "span",
                `badge ${bloc.editable ? bloc.state : bloc.active ? "available" : "hidden"}`,
                bloc.editable ? titleCase(bloc.state) : bloc.active ? "Available" : "Hidden",
            ),
        );
    }
    body.append(footer);
    card.append(preview, body);
    return card;
}

function blocLink(bloc: BlocItem, className: string): HTMLAnchorElement | HTMLButtonElement {
    if (!bloc.editable) {
        const link = button("", "open-bloc", className);
        link.dataset.tag = bloc.tag;
        return link;
    }
    const link = element("a", className);
    link.href = route(bloc.editPath!);
    return link;
}

function selectFilter(name: string, label: string, value: string, options: string[][]): HTMLSelectElement {
    const select = element("select", "filter");
    select.setAttribute("aria-label", label);
    select.dataset.filter = name;
    for (const [id, text] of options) {
        const option = element("option", "", text);
        option.value = id!;
        select.append(option);
    }
    select.value = value;
    return select;
}

function matchesBloc(bloc: BlocItem, filters: BlocFilters, availability?: AvailabilityView): boolean {
    const id = availability?.resources.get(bloc.tag);
    const active = id ? availability!.selected.has(id) : bloc.active;
    const state = bloc.editable ? bloc.state : active ? "available" : "hidden";
    return (
        (!filters.group || bloc.group === filters.group) &&
        (!filters.state || state === filters.state) &&
        (!filters.query ||
            [bloc.name, bloc.description, bloc.group, bloc.tag].some((value) =>
                value.toLowerCase().includes(filters.query.toLowerCase()),
            ))
    );
}

function titleCase(value: string): string {
    return value[0]!.toUpperCase() + value.slice(1);
}
