import { expect, test } from "bun:test";
import { File } from "node:buffer";
import { prepare_bloc } from "@bernouy/cms-bloc-compile";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { decodeDefaultContent, decodeSource } from "./source";

const tableTags = ["basic-table", "basic-table-cell", "basic-table-header-cell", "basic-table-row"];

export function registerTableTests(): void {
    test("provides editable table primitives with constrained nesting", async () => {
        const repo = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
        const definition = await repo.get("ulvia");
        const artifacts =
            definition?.artifacts?.filter(
                (artifact) => artifact.type === "bloc" && tableTags.includes(artifact.bloc.tag),
            ) ?? [];

        expect(artifacts).toHaveLength(4);
        const byTag = new Map(
            artifacts.flatMap((artifact) => (artifact.type === "bloc" ? [[artifact.bloc.tag, artifact.bloc]] : [])),
        );
        const table = byTag.get("basic-table");
        const row = byTag.get("basic-table-row");
        const cell = byTag.get("basic-table-cell");
        const headerCell = byTag.get("basic-table-header-cell");

        expect(table?.editorJS).toContain('slot: "header"');
        expect(table?.editorJS).toContain('tag: "basic-table-row"');
        expect(row?.editorJS).toContain('tag: "basic-table-cell"');
        expect(row?.editorJS).toContain('tag: "basic-table-header-cell"');
        expect(cell?.editorJS).toContain('format: "text", dynamic: true');
        expect(cell?.editorJS).not.toContain("contentSlots()");
        expect(headerCell?.editorJS).toContain('attribute: "sort"');
        expect(headerCell?.editorJS).toContain('attribute: "filter-name"');

        expect(decodeDefaultContent(table?.source)).toContain('<basic-table-row slot="header">');
        expect(decodeSource(table?.source?.["style.css"])).toContain("overflow-x: auto");
        expect(decodeSource(cell?.source?.["style.css"])).toContain(
            "font-size: var(--ulvia-font-size-small, 0.875rem)",
        );
        expect(decodeSource(headerCell?.source?.["style.css"])).toContain(
            "font-size: var(--ulvia-font-size-small, 0.875rem)",
        );
        expect(decodeSource(row?.source?.["template.html"])).toContain('slot name="navigation"');
        expect(row?.viewJS).toContain('setAttribute("role", "row")');
        expect(row?.viewJS).not.toContain('CustomEvent("basic-table-row:activate"');
        expect(row?.editorJS).toContain('label: "Navigation"');
        expect(row?.editorJS).toContain('tag: "a"');
        expect(cell?.viewJS).toContain('setAttribute("role", "cell")');
        expect(headerCell?.viewJS).toContain('setAttribute("role", "columnheader")');
        expect(headerCell?.viewJS).toContain('url.searchParams.set("sort", sort)');
        expect(headerCell?.viewJS).toContain("url.searchParams.set(`f_${filterName}`, value)");
    });

    test("runs accessible row and filter interactions", async () => {
        const repo = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
        const definition = await repo.get("ulvia");
        const artifacts =
            definition?.artifacts?.filter(
                (artifact) => artifact.type === "bloc" && tableTags.includes(artifact.bloc.tag),
            ) ?? [];

        for (const artifact of artifacts) {
            if (artifact.type !== "bloc") {
                continue;
            }
            const bloc = artifact.bloc;
            const built = await prepare_bloc(
                new File([bloc.viewJS ?? ""], "Bloc.js", { type: "application/javascript" }),
                new File([bloc.editorJS ?? ""], "BlocEditor.ts", { type: "application/typescript" }),
                bloc.name,
                bloc.group ?? "",
                bloc.description ?? "",
                bloc.tag,
                bloc.source,
                decodeDefaultContent(bloc.source),
            );
            new Function(built.viewJS)();
        }

        const table = document.createElement("basic-table");
        table.setAttribute("accessible-label", "Pipeline");
        const row = document.createElement("basic-table-row");
        const cell = document.createElement("basic-table-cell");
        const headerCell = document.createElement("basic-table-header-cell");
        headerCell.setAttribute("filter-name", "status");
        row.append(cell);
        table.append(row);
        document.body.append(table, headerCell);

        expect(table.getAttribute("role")).toBe("table");
        expect(table.getAttribute("aria-label")).toBe("Pipeline");
        expect(row.getAttribute("role")).toBe("row");
        expect(cell.getAttribute("role")).toBe("cell");
        expect(headerCell.getAttribute("role")).toBe("columnheader");

        const navigation = document.createElement("a");
        navigation.slot = "navigation";
        navigation.href = "/sales/42";
        navigation.setAttribute("aria-label", "Open Acme sale");
        row.prepend(navigation);
        expect(row.getAttribute("role")).toBe("row");
        expect(row.hasAttribute("href")).toBeFalse();
        expect(row.hasAttribute("tabindex")).toBeFalse();
        expect(row.querySelector(":scope > a[href]")).toBe(navigation);
        expect(navigation.pathname).toBe("/sales/42");
        expect(navigation.getAttribute("aria-label")).toBe("Open Acme sale");

        const filterButton = headerCell.shadowRoot?.querySelector("[data-filter-toggle]");
        const filterPopover = headerCell.shadowRoot?.querySelector("[data-filter-popover]");
        expect(filterButton?.hasAttribute("hidden")).toBe(false);
        filterButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        expect(filterPopover?.hasAttribute("hidden")).toBe(false);
        window.dispatchEvent(new MouseEvent("click"));
        expect(filterPopover?.hasAttribute("hidden")).toBe(true);

        table.remove();
        headerCell.remove();
    });
}
