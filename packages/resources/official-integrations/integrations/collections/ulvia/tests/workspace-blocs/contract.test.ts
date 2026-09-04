import { File } from "node:buffer";
import { describe, expect, test } from "bun:test";
import { prepare_bloc, validateBloc } from "@bernouy/cms-bloc-compile";
import { decodeSource, loadDefinition, loadWorkspaceBloc } from "./source";

const workspaceTags = [
    "workspace-detail-section",
    "workspace-lateral-menu",
    "workspace-lateral-menu-item",
    "workspace-shell",
    "workspace-shell-detail",
] as const;

describe("workspace-blocs 1.0.0 catalogue", () => {
    test("hydrates and builds every editable workspace design-system bloc", async () => {
        const definition = await loadDefinition();

        expect(definition.kind).toBe("ulvia");
        expect(definition.inputs).toEqual([]);
        expect(
            definition.artifacts.filter(
                (artifact) =>
                    artifact.type === "bloc" && artifact.bloc.path?.startsWith("blocs/foundation/workspace-blocs/"),
            ),
        ).toHaveLength(workspaceTags.length);

        for (const tag of workspaceTags) {
            const bloc = await loadWorkspaceBloc(tag);
            expect(bloc.source?.["manifest.json"]).toBeTruthy();
            expect(bloc.source?.["default.html"]).toBeTruthy();
            expect(bloc.source?.["BlocEditor.ts"]).toBeTruthy();
            expect(
                validateBloc({
                    tag: bloc.tag,
                    native: false,
                    viewSource: bloc.viewJS,
                    editorSource: bloc.editorJS,
                }).errors,
            ).toEqual([]);

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

            expect(built.id).toBe(tag);
            expect(built.viewJS).toContain(`customElements.define("${tag}"`);
            expect(built.editorJS).toContain("registerEditor");
        }
    });

    test("keeps the double navigation responsive, accessible, and current-aware", async () => {
        const shell = await loadWorkspaceBloc("workspace-shell");
        const menu = await loadWorkspaceBloc("workspace-lateral-menu");
        const item = await loadWorkspaceBloc("workspace-lateral-menu-item");
        const runtime = decodeSource(shell.source?.["Bloc.ts"]);
        const shellTemplate = decodeSource(shell.source?.["template.html"]);
        const shellStyle = decodeSource(shell.source?.["style.css"]);
        const menuRuntime = decodeSource(menu.source?.["Bloc.ts"]);
        const itemRuntime = decodeSource(item.source?.["runtime/compute.ts"]);

        expect(shellTemplate).toContain('slot name="sidebar"');
        expect(shellTemplate).toContain('slot name="secondary-sidebar"');
        expect(runtime).toContain('event.key === "Escape"');
        expect(runtime).toContain('removeEventListener("change", this.onMobileMediaChange)');
        expect(shellStyle).toContain("@media (max-width: 720px)");
        expect(shellStyle).toContain(":host([mobile-secondary-open]) .secondary-sidebar");
        expect(menuRuntime).toContain('removeEventListener("keydown", this.onKeyDown)');
        expect(itemRuntime).toContain('anchor?.setAttribute("aria-current", "page")');
        expect(itemRuntime).toContain("current.pathname.startsWith(`${targetPath}/`)");
    });

    test("exposes editor contracts for application chrome and detail tools", async () => {
        const expectedSlots = new Map([
            [
                "workspace-shell",
                ["Skip link", "Primary navigation", "Secondary navigation", "Main content target", "Content"],
            ],
            ["workspace-lateral-menu", ["Header", "Navigation items", "Footer"]],
            ["workspace-lateral-menu-item", ["Navigation link"]],
            ["workspace-shell-detail", ["Title", "Actions", "Main", "Aside"]],
            ["workspace-detail-section", ["Actions", "Content"]],
        ]);

        for (const [tag, slots] of expectedSlots) {
            const bloc = await loadWorkspaceBloc(tag);
            const editor = decodeSource(bloc.source?.["BlocEditor.ts"]);
            for (const slot of slots) {
                expect(editor).toContain(`label: "${slot}"`);
            }
        }
    });
});

function decodeDefaultContent(source: Record<string, string> | undefined): string | undefined {
    const manifest = JSON.parse(decodeSource(source?.["manifest.json"])) as { defaultContent?: string };
    const path = manifest.defaultContent?.replace(/^\.\//, "");
    return path ? decodeSource(source?.[path]) : undefined;
}
