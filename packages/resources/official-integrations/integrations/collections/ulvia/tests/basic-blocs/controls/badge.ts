import { expect, test } from "bun:test";
import { File } from "node:buffer";
import { prepare_bloc } from "@bernouy/cms-bloc-compile";
import { Component } from "@bernouy/components/base";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { executeEditorBundle } from "../catalog/support";
import { decodeDefaultContent, decodeSource } from "../source";

export function registerBadgeTest(): void {
    test("badge exposes a presentational dynamic label without selection semantics", async () => {
        const repo = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
        const definition = await repo.get("ulvia");
        const artifact = definition?.artifacts?.find(
            (candidate) => candidate.type === "bloc" && candidate.bloc.tag === "basic-badge",
        );
        if (!artifact || artifact.type !== "bloc") {
            throw new Error("expected basic-badge artifact");
        }

        const bloc = artifact.bloc;
        const built = await prepare_bloc(
            new File([bloc.viewJS ?? ""], "Bloc.ts", { type: "application/typescript" }),
            new File([bloc.editorJS ?? ""], "BlocEditor.ts", { type: "application/typescript" }),
            bloc.name,
            bloc.group ?? "",
            bloc.description ?? "",
            bloc.tag,
            bloc.source,
            decodeDefaultContent(bloc.source),
        );
        const runtime = window as typeof window & { p9r?: { Component?: typeof Component } };
        runtime.p9r ??= {};
        runtime.p9r.Component = Component;
        new Function(built.viewJS)();

        const badge = document.createElement("basic-badge");
        badge.textContent = "Published";
        document.body.append(badge);
        expect(badge.getAttribute("role")).toBeNull();
        expect(badge.shadowRoot?.querySelector("[role]")).toBeNull();
        expect(badge.shadowRoot?.querySelector('[part="badge"]')).not.toBeNull();
        expect(badge.shadowRoot?.querySelector('[part="dot"]')?.getAttribute("aria-hidden")).toBe("true");
        expect(built.viewJS).not.toContain("addEventListener");

        const styles = decodeSource(bloc.source?.["style.css"]);
        const colorSchemes = decodeSource(bloc.source?.["colorSchemes.ts"]);
        expect(colorSchemes).toContain('value: "primary"');
        expect(colorSchemes).toContain('value: "neutral"');
        for (const tone of ["secondary", "info", "success", "warning", "danger"]) {
            expect(colorSchemes).toContain(`scheme("${tone}"`);
        }
        for (const appearance of ["filled", "outlined", "ghost"]) {
            expect(styles).toContain(`:host([appearance="${appearance}"])`);
        }
        expect(styles).toContain(':host([dot]:not([dot="false"]))');
        expect(styles).toContain("var(--basic-badge-dot-color, currentColor)");
        expect(styles).toContain("--basic-badge-font-size: .875rem");
        expect(styles).toContain("--basic-badge-font-size: 1rem");

        const registration = executeEditorBundle(built.editorJS);
        const editor = new registration.editor!(badge);
        expect(editor.getSettings()[0]?.settings.map((setting) => setting.attribute)).toEqual([
            "tone",
            "appearance",
            "size",
            "dot",
        ]);
        expect(editor.getTextCapability()).toEqual({ format: "text", dynamic: true });
        expect(editor.getContentSlots()).toEqual([]);
        badge.remove();
    });
}
