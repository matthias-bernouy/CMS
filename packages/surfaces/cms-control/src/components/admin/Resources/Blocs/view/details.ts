import { route } from "../../Integrations/api";
import type { BlocCollection, BlocItem } from "../data/model";
import { openDialog } from "../actions/dialog";
import { element } from "./dom";

export function showBlocDetails(root: ShadowRoot, bloc: BlocItem, collection: BlocCollection): void {
    const { dialog, body } = openDialog(root, bloc.name, "bloc-detail-dialog");
    const intro = element("p", "dialog-description", bloc.description || `A bloc from ${collection.name}.`);
    const preview = element("div", "detail-preview");
    const frame = element("iframe");
    frame.title = `${bloc.name} preview`;
    frame.setAttribute("sandbox", "allow-scripts");
    frame.src = route(`/api/bloc/preview?id=${encodeURIComponent(bloc.tag)}`);
    preview.append(frame);
    body.append(
        intro,
        preview,
        element("p", "preview-caption", "Default content preview · Live data and interactions are paused."),
    );
    const metadata = element("dl", "bloc-metadata");
    for (const [label, value] of [
        ["Collection", collection.name],
        ["Category", bloc.group || "Uncategorised"],
        ["Used in", `${bloc.usageCount} places`],
        ["Editor", bloc.active ? "Available" : "Hidden"],
    ]) {
        const item = element("div");
        item.append(element("dt", "", label), element("dd", "", value));
        metadata.append(item);
    }
    body.append(metadata);
    if (bloc.usages.pages.length) {
        const usage = element("section", "usage-list");
        usage.append(element("h3", "", "Pages using this bloc"));
        for (const page of bloc.usages.pages) {
            const link = element("a", "", page.label);
            link.href = route(`/editor/page?id=${encodeURIComponent(page.id)}`);
            usage.append(link);
        }
        body.append(usage);
    }
    const technical = element("details", "technical-details");
    technical.append(element("summary", "", "Technical details"), element("code", "", bloc.tag));
    if (bloc.directDependencies.length) {
        technical.append(element("p", "", `Depends on: ${bloc.directDependencies.join(", ")}`));
    }
    body.append(technical);
    dialog.querySelector<HTMLButtonElement>(".close-button")?.focus();
}
