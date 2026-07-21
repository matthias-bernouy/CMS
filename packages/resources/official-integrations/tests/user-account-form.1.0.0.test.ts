import { describe, expect, test } from "bun:test";
import { prepare_bloc } from "@bernouy/cms-bloc-compile";
import { createBlocUsageResolver } from "@bernouy/cms-content";
import { Composition } from "@bernouy/components/base";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { declaredBlocViewSources } from "./helpers/blocArtifactSource";

describe("user-account form 1.0.0", () => {
    test("compiles as a Light DOM composition and exposes its Basic Blocs dependencies", async () => {
        const definition = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT).get("user-account");
        if (!definition) {
            throw new Error("user-account definition not found");
        }
        const artifact = definition.artifacts?.find(
            (item) => item.type === "bloc" && item.bloc.tag === "user-account-form",
        );
        const avatarArtifact = definition.artifacts?.find(
            (item) => item.type === "bloc" && item.bloc.tag === "user-account-avatar",
        );
        if (!artifact || artifact.type !== "bloc" || !artifact.bloc.viewJS || !artifact.bloc.editorJS) {
            throw new Error("user-account-form sources not found");
        }
        if (!avatarArtifact || avatarArtifact.type !== "bloc" || !avatarArtifact.bloc.viewJS) {
            throw new Error("user-account-avatar sources not found");
        }

        const compiled = await prepare_bloc(
            new File([artifact.bloc.viewJS], "Bloc.ts", { type: "text/typescript" }),
            new File([artifact.bloc.editorJS], "BlocEditor.ts", { type: "text/typescript" }),
            artifact.bloc.name,
            artifact.bloc.group ?? "User account",
            artifact.bloc.description ?? "",
            artifact.bloc.tag,
            artifact.bloc.source,
        );
        const compiledAvatar = await prepare_bloc(
            new File([avatarArtifact.bloc.viewJS], "Bloc.ts", { type: "text/typescript" }),
            null,
            avatarArtifact.bloc.name,
            avatarArtifact.bloc.group ?? "User account",
            avatarArtifact.bloc.description ?? "",
            avatarArtifact.bloc.tag,
            avatarArtifact.bloc.source,
        );
        const resolveUsage = createBlocUsageResolver(
            [
                { id: "user-account-form" },
                { id: "user-account-avatar" },
                { id: "basic-grid" },
                { id: "basic-stack" },
                { id: "basic-input" },
                { id: "basic-button" },
                { id: "basic-toast" },
                { id: "basic-skeleton" },
            ],
            {
                getBlocViewJS: async (tag) =>
                    tag === "user-account-form"
                        ? compiled.viewJS
                        : tag === "user-account-avatar"
                          ? compiledAvatar.viewJS
                          : null,
            },
        );
        const viewSource = declaredBlocViewSources(artifact.bloc);
        const editorSource = artifact.bloc.editorJS;

        expect(definition.dependencies).toEqual([{ name: "basicBlocs", kind: "basic-blocs" }]);
        expect(compiled.viewJS).toContain("window.p9r.Composition");
        expect(compiled.viewJS).toContain("<user-account-avatar");
        expect(compiled.viewJS).toContain('<basic-grid min="lg" max="none"');
        expect(compiled.viewJS).toContain("<basic-stack");
        expect(compiled.viewJS).toContain('<basic-skeleton shape="circle"');
        expect(compiled.viewJS).toContain('cms-condition="$source.loading"');
        expect(compiled.viewJS).not.toContain("Mes informations");
        expect(compiled.viewJS).not.toContain("data-account-title");
        expect(compiled.viewJS).toContain(
            '<form data-account-form cms-source-trigger="submit" cms-source-method="POST" cms-source-success-reset="false" cms-condition="$source.loaded">\n                <basic-stack gap="lg">',
        );
        expect(compiled.viewJS).not.toContain("<p9r-grid");
        expect(compiled.viewJS).not.toContain("<p9r-stack");
        expect(compiled.viewJS).toContain('<basic-toast data-toast-kind="success" role="status"');
        expect(compiled.viewJS).toContain('<basic-toast data-toast-kind="error" role="alert"');
        expect(compiled.viewJS).not.toContain("<basic-toast type=");
        expect(compiled.viewJS).not.toContain('<p cms-condition="save.ok"');
        expect(compiled.viewJS).not.toContain("<cms-binding-core");
        expect(compiled.viewJS).not.toContain("<style>");
        expect(compiledAvatar.viewJS).toContain("window.p9r.Component");
        expect(compiledAvatar.viewJS).toContain("Choisir une photo de profil");
        expect(compiledAvatar.viewJS).toContain("URL.createObjectURL");
        expect(compiled.viewJS).toContain('cms-source-trigger="submit"');
        expect(compiled.viewJS).toContain(
            'name="birthDate" label="Date de naissance" type="date" autocomplete="bday" min="1900-01-01"',
        );
        expect(compiled.viewJS).not.toContain('date-format="day-month-year"');
        expect(compiled.viewJS).not.toContain('placeholder="jj/mm/aaaa"');
        expect(compiled.viewJS).not.toContain("invalid-date-message");
        expect(compiled.viewJS).toContain('value="{{ subject.email }}" disabled');
        expect(compiled.viewJS).not.toContain('name="email"');
        expect(compiled.viewJS).toContain("system-auth/me");
        expect(viewSource).toContain("element.hidden = !visible");
        expect(viewSource).toContain('control?.toggleAttribute("disabled", !visible)');
        expect(viewSource).toContain(
            'this.setAttributeIfChanged(this.querySelector(\'[data-account-field="birth-date"]\'), "max", currentLocalDate())',
        );
        expect(viewSource).toContain("date.getFullYear()");
        expect(viewSource).toContain("date.getMonth() + 1");
        expect(viewSource).toContain("date.getDate()");
        expect(editorSource).toContain("show-address-line-3");
        expect(editorSource).toContain("field-background-color");
        expect(editorSource).toContain("button-background-color");
        expect(editorSource).toContain("avatar-border-color");
        expect(editorSource).toContain("skeleton-base-color");
        expect(editorSource).toContain("success-toast-background-color");
        expect(editorSource).toContain("error-toast-background-color");
        expect(editorSource).toContain("toast-position");
        expect(viewSource).toContain('this.setOptionalAttribute(input, "background-color"');
        expect(await resolveUsage("<user-account-form></user-account-form>")).toEqual([
            "basic-button",
            "basic-grid",
            "basic-input",
            "basic-skeleton",
            "basic-stack",
            "basic-toast",
            "user-account-avatar",
            "user-account-form",
        ]);

        const previousP9r = (window as typeof window & { p9r?: unknown }).p9r;
        (window as typeof window & { p9r?: unknown }).p9r = { Composition };
        try {
            new Function(compiled.viewJS)();
            const form = document.createElement("user-account-form");
            document.body.append(form);

            const birthDate = form.querySelector('[data-account-field="birth-date"]');
            const now = new Date();
            const expectedMaximum = [
                String(now.getFullYear()).padStart(4, "0"),
                String(now.getMonth() + 1).padStart(2, "0"),
                String(now.getDate()).padStart(2, "0"),
            ].join("-");

            expect(birthDate?.getAttribute("type")).toBe("date");
            expect(birthDate?.getAttribute("max")).toBe(expectedMaximum);
            expect(birthDate?.hasAttribute("date-format")).toBe(false);
            form.remove();
        } finally {
            (window as typeof window & { p9r?: unknown }).p9r = previousP9r;
        }
    });
});
