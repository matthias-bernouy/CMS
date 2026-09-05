import { describe, expect, test } from "bun:test";
import { prepare_bloc } from "@bernouy/cms-bloc-compile";
import { createBlocUsageResolver, expandCompositions } from "@bernouy/cms-content";
import { Component } from "@bernouy/components/base";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { declaredBlocViewSources } from "../../../../../tests/helpers/blocArtifactSource";

describe("Mossa user-account form", () => {
    test("expands as light DOM and upgrades its internal behavior component", async () => {
        const definition = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT).get("mossa");
        if (!definition) {
            throw new Error("user-account definition not found");
        }
        const formArtifact = definition.artifacts?.find(
            (item) => item.type === "bloc" && item.bloc.tag === "mossa-user-account-form",
        );
        const controllerArtifact = definition.artifacts?.find(
            (item) => item.type === "bloc" && item.bloc.tag === "mossa-user-account-form-controller",
        );
        const avatarArtifact = definition.artifacts?.find(
            (item) => item.type === "bloc" && item.bloc.tag === "mossa-user-account-avatar",
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
            throw new Error("mossa-user-account-form composition sources not found");
        }
        if (!avatarArtifact || avatarArtifact.type !== "bloc" || !avatarArtifact.bloc.viewJS) {
            throw new Error("mossa-user-account-avatar sources not found");
        }

        const controller = await prepare_bloc(
            new File([controllerArtifact.bloc.viewJS], "Bloc.ts", { type: "text/typescript" }),
            null,
            controllerArtifact.bloc.name,
            controllerArtifact.bloc.group ?? "User account",
            controllerArtifact.bloc.description ?? "",
            controllerArtifact.bloc.tag,
            controllerArtifact.bloc.source,
            undefined,
            { viewPath: controllerArtifact.bloc.view },
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
            { id: "mossa-user-account-form", compositionHTML },
            { id: "mossa-user-account-form-controller" },
            { id: "mossa-user-account-avatar" },
            { id: "mossa-responsive-grid" },
            { id: "mossa-stack" },
            { id: "mossa-input" },
            { id: "mossa-button" },
            { id: "mossa-toast" },
            { id: "mossa-skeleton" },
        ];
        const resolveUsage = createBlocUsageResolver(blocList, {
            getBlocViewJS: async (tag) =>
                tag === "mossa-user-account-form-controller"
                    ? controller.viewJS
                    : tag === "mossa-user-account-avatar"
                      ? avatar.viewJS
                      : null,
        });

        expect(definition.type).toBe("collection");
        expect(formArtifact.bloc.viewJS).toBeUndefined();
        expect(controller.viewJS).toContain("window.p9r.Component");
        expect(compositionHTML).toContain("<mossa-user-account-form-controller");
        expect(compositionHTML).toContain("<mossa-user-account-avatar");
        expect(compositionHTML).toContain('<mossa-responsive-grid min="lg" max="none"');
        expect(compositionHTML).toContain('<mossa-skeleton data-account-loading shape="circle"');
        expect(compositionHTML).toContain('cms-condition="$source.loading"');
        expect(compositionHTML).toContain('cms-source-trigger="submit"');
        expect(compositionHTML).toContain('data-avatar-form cms-source-id="avatar"');
        expect(compositionHTML).toContain('data-account-form cms-source-id="save"');
        expect(compositionHTML).toContain('cms-condition="$source.loading"');
        expect(compositionHTML).toContain('cms-condition="$source.loaded"');
        expect(compositionHTML).toContain('cms-condition="$source.error"');
        expect(compositionHTML).not.toContain("$sources.avatar");
        expect(compositionHTML).not.toContain("$sources.save");
        expect(compositionHTML).not.toMatch(/cms-condition="(?:avatar|save)\./);
        expect(compositionHTML).toContain(
            'name="birthDate" label="Birth date" type="date" autocomplete="bday" min="1900-01-01"',
        );
        expect(compositionHTML).not.toContain("subject.email");
        expect(compositionHTML).not.toContain("<cms-binding-core");
        expect(avatar.viewJS).toContain("window.p9r.Component");
        expect(avatar.viewJS).toContain("URL.createObjectURL");
        expect(viewSource).toContain("element.hidden = !visible");
        expect(viewSource).toContain('control?.toggleAttribute("disabled", !visible)');
        expect(viewSource).toContain("currentLocalDate()");
        expect(viewSource).toContain("/.cms/sources/user-account/getAccount");
        expect(viewSource).not.toContain("system-auth");
        expect(editorSource).toContain("show-address-line-3");
        expect(editorSource).toContain("toast-position");
        expect(await resolveUsage("<mossa-user-account-form></mossa-user-account-form>")).toEqual([
            "mossa-button",
            "mossa-input",
            "mossa-responsive-grid",
            "mossa-skeleton",
            "mossa-stack",
            "mossa-toast",
            "mossa-user-account-avatar",
            "mossa-user-account-form",
            "mossa-user-account-form-controller",
        ]);

        const previousP9r = (window as typeof window & { p9r?: unknown }).p9r;
        (window as typeof window & { p9r?: unknown }).p9r = { Component };
        try {
            new Function(controller.viewJS)();
            document.body.innerHTML = "<mossa-user-account-form></mossa-user-account-form>";
            expandCompositions(document.body, [{ id: "mossa-user-account-form", compositionHTML }]);

            const form = document.querySelector("mossa-user-account-form-controller");
            const birthDate = form?.querySelector('[data-account-field="birth-date"]');
            const now = new Date();
            const expectedMaximum = [
                String(now.getFullYear()).padStart(4, "0"),
                String(now.getMonth() + 1).padStart(2, "0"),
                String(now.getDate()).padStart(2, "0"),
            ].join("-");

            expect(document.querySelector("mossa-user-account-form")).toBeNull();
            expect(birthDate?.getAttribute("type")).toBe("date");
            expect(birthDate?.getAttribute("max")).toBe(expectedMaximum);
            expect(birthDate?.hasAttribute("date-format")).toBe(false);
            form?.setAttribute("given-name-label", "Preferred given name");
            form?.setAttribute("success-message", "Profile updated");
            form?.setAttribute("avatar-error-message", "Please retry the image upload");
            await Promise.resolve();
            expect(form?.querySelector('[data-account-field="given-name"]')?.getAttribute("label")).toBe(
                "Preferred given name",
            );
            expect(form?.querySelector('[data-account-copy="success-message"]')?.textContent).toBe("Profile updated");
            expect(form?.querySelector('[data-account-copy="avatar-error-message"]')?.textContent).toBe(
                "Please retry the image upload",
            );
            form?.removeAttribute("given-name-label");
            await Promise.resolve();
            expect(form?.querySelector('[data-account-field="given-name"]')?.getAttribute("label")).toBe("First name");
        } finally {
            document.body.replaceChildren();
            (window as typeof window & { p9r?: unknown }).p9r = previousP9r;
        }
    });
});
