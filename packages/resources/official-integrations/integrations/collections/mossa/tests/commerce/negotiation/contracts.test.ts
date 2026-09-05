import { describe, expect, test } from "bun:test";
import { prepare_bloc } from "@bernouy/cms-bloc-compile";
import { createBlocUsageResolver } from "@bernouy/cms-content";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { declaredBlocViewSources } from "../../../../../../tests/helpers/blocArtifactSource";

describe("Mossa Commerce negotiation blocks", () => {
    test("compiles customizable Light DOM compositions built from Mossa blocks", async () => {
        const definition = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT).get("mossa");
        if (!definition) {
            throw new Error("Mossa collection definition not found");
        }
        const artifacts =
            definition.artifacts?.filter(
                (item): item is Extract<typeof item, { type: "bloc" }> => item.type === "bloc",
            ) ?? [];
        const formArtifact = artifacts.find((artifact) => artifact.bloc.tag === "mossa-commerce-negotiation-form");
        const listArtifact = artifacts.find((artifact) => artifact.bloc.tag === "mossa-commerce-negotiation-list");
        const formController = artifacts.find(
            (artifact) => artifact.bloc.tag === "mossa-commerce-negotiation-form-controller",
        );
        const listController = artifacts.find(
            (artifact) => artifact.bloc.tag === "mossa-commerce-negotiation-list-controller",
        );
        if (
            !formArtifact?.bloc.compositionHTML ||
            !formArtifact.bloc.editorJS ||
            !listArtifact?.bloc.compositionHTML ||
            !listArtifact.bloc.editorJS ||
            !formController?.bloc.viewJS ||
            !listController?.bloc.viewJS
        ) {
            throw new Error("commerce negotiation composition sources not found");
        }
        const form = await prepare_bloc(
            new File([formController.bloc.viewJS], "Bloc.ts", { type: "text/typescript" }),
            null,
            formController.bloc.name,
            formController.bloc.group ?? "Commerce",
            formController.bloc.description ?? "",
            formController.bloc.tag,
            formController.bloc.source,
            undefined,
            { viewPath: "controller/Bloc.ts" },
        );
        const list = await prepare_bloc(
            new File([listController.bloc.viewJS], "Bloc.ts", { type: "text/typescript" }),
            null,
            listController.bloc.name,
            listController.bloc.group ?? "Commerce",
            listController.bloc.description ?? "",
            listController.bloc.tag,
            listController.bloc.source,
            undefined,
            { viewPath: "controller/Bloc.ts" },
        );
        const formRuntime = `${formArtifact.bloc.compositionHTML}\n${form.viewJS}`;
        const listRuntime = `${listArtifact.bloc.compositionHTML}\n${list.viewJS}`;
        const formViewSource = declaredBlocViewSources(formController.bloc);
        const listViewSource = declaredBlocViewSources(listController.bloc);
        const formEditorSource = formArtifact?.bloc.editorJS ?? "";
        const listEditorSource = listArtifact?.bloc.editorJS ?? "";
        expect(definition.type).toBe("collection");
        expect(
            definition.type === "collection"
                ? definition.resources.find(({ id }) => id === "mossa/blocs/commerce-negotiation-form")?.endpoints
                : undefined,
        ).toEqual(expect.arrayContaining([expect.objectContaining({ source: "commerce-negotiation" })]));
        expect(form.viewJS).toContain("window.p9r.Component");
        expect(formRuntime).toContain("getProposalPolicy");
        expect(formRuntime).toContain("myProposals");
        expect(formRuntime).toContain("existing-message");
        expect(formRuntime).toContain("createMyProposal");
        expect(formRuntime).toContain("system-functions");
        expect(formViewSource).toContain('getAttribute("show-message") === "false"');
        expect(formViewSource).toContain("wholeUnitPrices");
        expect(formViewSource).toContain('style.setProperty("display", "none", "important")');
        expect(formViewSource).toContain('toast.setAttribute("tone", error ? "danger" : "success")');
        expect(formViewSource).toContain('toast.setAttribute("appearance", "filled")');
        expect(formViewSource).not.toContain('"toast-error-background-color"');
        expect(formRuntime).toContain("<mossa-input");
        expect(formRuntime).toContain("<mossa-textarea");
        expect(formRuntime).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
        expect(formEditorSource).not.toContain('type: "color"');
        expect(list.viewJS).toContain("window.p9r.Component");
        expect(listRuntime).toContain("myProposals");
        expect(listRuntime).toContain("respondToProposal");
        expect(listRuntime).toContain("withdrawMyProposal");
        expect(listRuntime).toContain("mossa-pagination:change");
        expect(listRuntime).toContain('justify-content="space-between"');
        expect(listRuntime).toContain("data-empty-state");
        expect(listViewSource).toContain("this.total <= positiveInteger");
        expect(listRuntime).toContain("history.replaceState");
        expect(listViewSource).toContain('style.setProperty("display", "none", "important")');
        expect(listViewSource).toContain('toggleAttribute("selected", this.role === "buyer")');
        expect(listViewSource).toContain('this.role === "all"');
        expect(listViewSource).toContain('getAttribute("grid-packing")');
        expect(listViewSource).toContain('proposal.viewerRole === "buyer"');
        expect(listViewSource).toContain('toast.setAttribute("tone", error ? "danger" : "success")');
        expect(listViewSource).toContain('toast.setAttribute("appearance", "filled")');
        expect(listViewSource).not.toContain('"toast-error-background-color"');
        expect(listRuntime).not.toContain("location.reload");
        expect(listEditorSource).toContain('attribute: "initial-role"');
        expect(listEditorSource).toContain('{ label: "Combined", value: "all" }');
        expect(listEditorSource).not.toContain('type: "color"');

        const available = [
            "mossa-button",
            "mossa-surface-card",
            "mossa-chip",
            "mossa-chip-group",
            "mossa-responsive-grid",
            "mossa-input",
            "mossa-option",
            "mossa-pagination",
            "mossa-select",
            "mossa-skeleton",
            "mossa-stack",
            "mossa-textarea",
            "mossa-toast",
            "mossa-commerce-negotiation-form",
            "mossa-commerce-negotiation-form-controller",
            "mossa-commerce-negotiation-list",
            "mossa-commerce-negotiation-list-controller",
        ].map((id) => ({
            id,
            ...(id === "mossa-commerce-negotiation-form" ? { compositionHTML: formArtifact.bloc.compositionHTML } : {}),
            ...(id === "mossa-commerce-negotiation-list" ? { compositionHTML: listArtifact.bloc.compositionHTML } : {}),
        }));
        const resolver = createBlocUsageResolver(available, {
            getBlocViewJS: async (tag) => {
                if (tag === "mossa-commerce-negotiation-form-controller") {
                    return form.viewJS;
                }
                if (tag === "mossa-commerce-negotiation-list-controller") {
                    return list.viewJS;
                }
                return null;
            },
        });
        expect(await resolver("<mossa-commerce-negotiation-form></mossa-commerce-negotiation-form>")).toEqual(
            expect.arrayContaining([
                "mossa-button",
                "mossa-surface-card",
                "mossa-responsive-grid",
                "mossa-input",
                "mossa-skeleton",
                "mossa-stack",
                "mossa-textarea",
                "mossa-toast",
                "mossa-commerce-negotiation-form",
                "mossa-commerce-negotiation-form-controller",
            ]),
        );
        expect(await resolver("<mossa-commerce-negotiation-list></mossa-commerce-negotiation-list>")).toEqual(
            expect.arrayContaining([
                "mossa-button",
                "mossa-surface-card",
                "mossa-chip",
                "mossa-chip-group",
                "mossa-responsive-grid",
                "mossa-option",
                "mossa-pagination",
                "mossa-select",
                "mossa-skeleton",
                "mossa-stack",
                "mossa-toast",
                "mossa-commerce-negotiation-list",
                "mossa-commerce-negotiation-list-controller",
            ]),
        );
    });
});
