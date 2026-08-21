import { expect, test } from "bun:test";
import { File } from "node:buffer";
import { prepare_bloc } from "@bernouy/cms-bloc-compile";
import { Component } from "@bernouy/components/base";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { executeEditorBundle } from "../catalog/support";
import { decodeDefaultContent, decodeSource } from "../source";

type DismissibleAlert = HTMLElement & { dismiss(): void };

export function registerAlertTest(): void {
    test("alert provides persistent inline feedback with explicit announcement semantics", async () => {
        const repo = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
        const definition = await repo.get("basic-blocs");
        const artifact = definition?.artifacts?.find(
            (candidate) => candidate.type === "bloc" && candidate.bloc.tag === "basic-alert",
        );
        if (!artifact || artifact.type !== "bloc") {
            throw new Error("expected basic-alert artifact");
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

        const alert = document.createElement("basic-alert") as DismissibleAlert;
        alert.append(document.createElement("p"));
        document.body.append(alert);
        const close = alert.shadowRoot?.querySelector<HTMLButtonElement>('[part="close"]');
        expect(alert.getAttribute("role")).toBeNull();
        expect(alert.shadowRoot?.querySelector("[role]")).toBeNull();
        expect(close?.hidden).toBe(true);
        expect(decodeSource(bloc.source?.["style.css"])).not.toContain("position: fixed");
        expect(decodeSource(bloc.source?.["Bloc.ts"])).not.toContain("setTimeout");

        alert.setAttribute("dismissible", "true");
        alert.setAttribute("close-label", "Close status message");
        expect(close?.hidden).toBe(false);
        expect(close?.getAttribute("aria-label")).toBe("Close status message");

        const preventDismiss = (event: Event) => event.preventDefault();
        alert.addEventListener("dismiss", preventDismiss);
        close?.click();
        expect(alert.isConnected).toBe(true);
        alert.removeEventListener("dismiss", preventDismiss);

        let dismissEvent: Event | undefined;
        alert.addEventListener("dismiss", (event) => {
            dismissEvent = event;
        });
        alert.dismiss();
        expect(dismissEvent?.bubbles).toBe(true);
        expect(dismissEvent?.cancelable).toBe(true);
        expect(alert.isConnected).toBe(false);

        const registration = executeEditorBundle(built.editorJS);
        const editor = new registration.editor!(document.createElement("basic-alert"));
        expect(editor.getSettings()[0]?.settings.map((setting) => setting.attribute)).toEqual(["tone", "appearance"]);
        expect(editor.getSettings()[1]?.settings.map((setting) => setting.attribute)).toEqual([
            "role",
            "dismissible",
            "close-label",
        ]);
        expect(editor.getContentSlots()).toEqual([
            { label: "Icon", slot: "icon", accepts: [{ kind: "media", accept: ["svg"] }], max: 1 },
            { label: "Title", slot: "title", accepts: [{ kind: "any-component" }], max: 1 },
            { label: "Message", accepts: [{ kind: "any-component" }] },
        ]);
    });
}
