import { describe, expect, test } from "bun:test";
import { prepare_bloc } from "@bernouy/cms-bloc-compile";
import { createBlocUsageResolver, expandCompositions } from "@bernouy/cms-content";
import { Component } from "@bernouy/components/base";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { declaredBlocViewSources } from "../../helpers/blocArtifactSource";

describe("user-account form 1.0.0", () => {
    test("expands as light DOM and upgrades its internal behavior component", async () => {
        const definition = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT).get("user-account");
        if (!definition) {
            throw new Error("user-account definition not found");
        }
        const formArtifact = definition.artifacts?.find(
            (item) => item.type === "bloc" && item.bloc.tag === "user-account-form",
        );
        const controllerArtifact = definition.artifacts?.find(
            (item) => item.type === "bloc" && item.bloc.tag === "user-account-form-controller",
        );
        const avatarArtifact = definition.artifacts?.find(
            (item) => item.type === "bloc" && item.bloc.tag === "user-account-avatar",
        );
        if (
            !formArtifact ||
            formArtifact.type !== "bloc" ||
            !formArtifact.bloc.compositionHTML ||
            !formArtifact.bloc.editorJS ||
            !controllerArtifact ||
            controllerArtifact.type !== "bloc" ||
            !controllerArtifact.bloc.viewJS
        ) {
            throw new Error("user-account-form composition sources not found");
        }
        if (!avatarArtifact || avatarArtifact.type !== "bloc" || !avatarArtifact.bloc.viewJS) {
            throw new Error("user-account-avatar sources not found");
        }

        const controller = await prepare_bloc(
            new File([controllerArtifact.bloc.viewJS], "Bloc.ts", { type: "text/typescript" }),
            null,
            controllerArtifact.bloc.name,
            controllerArtifact.bloc.group ?? "User account",
            controllerArtifact.bloc.description ?? "",
            controllerArtifact.bloc.tag,
            controllerArtifact.bloc.source,
        );
        const avatar = await prepare_bloc(
            new File([avatarArtifact.bloc.viewJS], "Bloc.ts", { type: "text/typescript" }),
            null,
            avatarArtifact.bloc.name,
            avatarArtifact.bloc.group ?? "User account",
            avatarArtifact.bloc.description ?? "",
            avatarArtifact.bloc.tag,
            avatarArtifact.bloc.source,
        );
        const compositionHTML = formArtifact.bloc.compositionHTML;
        const viewSource = declaredBlocViewSources(controllerArtifact.bloc);
        const editorSource = formArtifact.bloc.editorJS;
        const blocList = [
            { id: "user-account-form", compositionHTML },
            { id: "user-account-form-controller" },
            { id: "user-account-avatar" },
            { id: "basic-grid" },
            { id: "basic-stack" },
            { id: "basic-input" },
            { id: "basic-button" },
            { id: "basic-toast" },
            { id: "basic-skeleton" },
        ];
        const resolveUsage = createBlocUsageResolver(blocList, {
            getBlocViewJS: async (tag) =>
                tag === "user-account-form-controller"
                    ? controller.viewJS
                    : tag === "user-account-avatar"
                      ? avatar.viewJS
                      : null,
        });

        expect(definition.dependencies).toEqual([{ name: "basicBlocs", kind: "basic-blocs" }]);
        expect(formArtifact.bloc.viewJS).toBeUndefined();
        expect(controller.viewJS).toContain("window.p9r.Component");
        expect(compositionHTML).toContain("<user-account-form-controller");
        expect(compositionHTML).toContain("<user-account-avatar");
        expect(compositionHTML).toContain('<basic-grid min="lg" max="none"');
        expect(compositionHTML).toContain('<basic-skeleton shape="circle"');
        expect(compositionHTML).toContain('cms-condition="$source.loading"');
        expect(compositionHTML).toContain('cms-source-trigger="submit"');
        expect(compositionHTML).toContain(
            'name="birthDate" label="Date de naissance" type="date" autocomplete="bday" min="1900-01-01"',
        );
        expect(compositionHTML).toContain('value="{{ subject.email }}" disabled');
        expect(compositionHTML).not.toContain("<cms-binding-core");
        expect(avatar.viewJS).toContain("window.p9r.Component");
        expect(avatar.viewJS).toContain("URL.createObjectURL");
        expect(viewSource).toContain("element.hidden = !visible");
        expect(viewSource).toContain('control?.toggleAttribute("disabled", !visible)');
        expect(viewSource).toContain("currentLocalDate()");
        expect(editorSource).toContain("show-address-line-3");
        expect(editorSource).toContain("toast-position");
        expect(await resolveUsage("<user-account-form></user-account-form>")).toEqual([
            "basic-button",
            "basic-grid",
            "basic-input",
            "basic-skeleton",
            "basic-stack",
            "basic-toast",
            "user-account-avatar",
            "user-account-form",
            "user-account-form-controller",
        ]);

        const previousP9r = (window as typeof window & { p9r?: unknown }).p9r;
        (window as typeof window & { p9r?: unknown }).p9r = { Component };
        try {
            new Function(controller.viewJS)();
            document.body.innerHTML = "<user-account-form></user-account-form>";
            expandCompositions(document.body, [{ id: "user-account-form", compositionHTML }]);

            const form = document.querySelector("user-account-form-controller");
            const birthDate = form?.querySelector('[data-account-field="birth-date"]');
            const now = new Date();
            const expectedMaximum = [
                String(now.getFullYear()).padStart(4, "0"),
                String(now.getMonth() + 1).padStart(2, "0"),
                String(now.getDate()).padStart(2, "0"),
            ].join("-");

            expect(document.querySelector("user-account-form")).toBeNull();
            expect(birthDate?.getAttribute("type")).toBe("date");
            expect(birthDate?.getAttribute("max")).toBe(expectedMaximum);
            expect(birthDate?.hasAttribute("date-format")).toBe(false);
        } finally {
            document.body.replaceChildren();
            (window as typeof window & { p9r?: unknown }).p9r = previousP9r;
        }
    });
});
