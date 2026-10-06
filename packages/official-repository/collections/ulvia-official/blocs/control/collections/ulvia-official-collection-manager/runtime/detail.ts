import type { CollectionDetail } from "./model";

export function renderCollectionDetail(root: ShadowRoot, detail: CollectionDetail): void {
    text(root, "[data-detail-title]", detail.name || detail.collectionId);
    text(root, "[data-detail-description]", detail.description || `${detail.publisherId} collection`);
    text(root, "[data-theme-count]", String(detail.themeTokenCount));
    text(root, "[data-bloc-count]", String(detail.blocCount));
    text(root, "[data-text-count]", String(detail.textCount));
    renderActions(required(root, "[data-detail-actions]"), detail);
    renderOverview(required(root, "[data-detail-overview]"), detail);
    renderBlocs(required(root, "[data-detail-blocs]"), detail);
    mountResource(
        root,
        "[data-detail-theme]",
        "ulvia-official-collection-theme",
        detail.collectionId,
        detail.themeTokenCount,
    );
    mountResource(
        root,
        "[data-detail-texts]",
        "ulvia-official-collection-texts",
        detail.collectionId,
        detail.textCount,
    );
}

function renderActions(target: Element, detail: CollectionDetail): void {
    target.replaceChildren();
    if (detail.configurable) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.action = "configure";
        button.dataset.key = detail.collectionId;
        button.textContent = "Collection settings";
        target.append(button);
    }
}

function renderOverview(target: Element, detail: CollectionDetail): void {
    const metrics = document.createElement("div");
    metrics.setAttribute("part", "resource-metrics");
    metrics.append(
        metric(String(detail.blocCount), "Blocs"),
        metric(String(detail.pageCount), "Pages"),
        metric(String(detail.assetCount), "Assets"),
        metric(String(detail.textCount), "Texts"),
        metric(String(detail.themeTokenCount), "Theme tokens"),
    );
    const information = document.createElement("dl");
    information.setAttribute("part", "collection-information");
    information.append(
        definition("Publisher", detail.publisherId),
        definition("Version", detail.version),
        definition("Data generation", String(detail.dataGeneration)),
        definition("Repository", detail.repositoryId || "Local installation"),
        definition("Digest", detail.digest, true),
        definition("Text override locales", String(detail.overriddenLocaleCount)),
    );
    target.replaceChildren(metrics, information);
}

function renderBlocs(target: Element, detail: CollectionDetail): void {
    target.replaceChildren(
        ...detail.blocs.map((bloc) => {
            const article = document.createElement("article");
            article.setAttribute("part", "bloc-card");
            const heading = document.createElement("div");
            const title = document.createElement("h3");
            title.textContent = bloc.label;
            const id = document.createElement("code");
            id.textContent = bloc.id;
            heading.append(title, id);
            const description = document.createElement("p");
            description.textContent = bloc.description || "No description provided.";
            const metadata = document.createElement("small");
            metadata.textContent = `${bloc.internal ? "Internal" : "Public"} · ${bloc.surfaces.join(" + ")} · generation ${bloc.generation}`;
            article.append(heading, description, metadata);
            return article;
        }),
    );
    if (!detail.blocs.length) {
        target.append(empty("This collection does not publish any Blocs."));
    }
}

function mountResource(root: ShadowRoot, selector: string, tag: string, collectionId: string, count: number): void {
    const target = required(root, selector);
    target.replaceChildren();
    if (!count) {
        target.append(empty(`This collection does not publish ${tag.endsWith("texts") ? "texts" : "theme tokens"}.`));
        return;
    }
    const component = document.createElement(tag);
    component.setAttribute("collection-id", collectionId);
    target.append(component);
}

function metric(value: string, label: string): HTMLElement {
    const item = document.createElement("div");
    const amount = document.createElement("strong");
    amount.textContent = value;
    const copy = document.createElement("span");
    copy.textContent = label;
    item.append(amount, copy);
    return item;
}

function definition(label: string, value: string, code = false): HTMLElement {
    const item = document.createElement("div");
    const term = document.createElement("dt");
    term.textContent = label;
    const description = document.createElement("dd");
    const content = document.createElement(code ? "code" : "span");
    content.textContent = value;
    description.append(content);
    item.append(term, description);
    return item;
}

function empty(message: string): HTMLElement {
    const item = document.createElement("p");
    item.setAttribute("part", "empty");
    item.textContent = message;
    return item;
}

function text(root: ShadowRoot, selector: string, value: string): void {
    required(root, selector).textContent = value;
}

function required<T extends Element = HTMLElement>(root: ShadowRoot, selector: string): T {
    const element = root.querySelector<T>(selector);
    if (!element) {
        throw new Error(`Missing collection detail element: ${selector}`);
    }
    return element;
}
