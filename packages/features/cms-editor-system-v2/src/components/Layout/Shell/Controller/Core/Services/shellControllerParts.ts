import type { EditableStateSession, Editor } from "@bernouy/cms-content/editor";
import type { ShellDomRefs } from "../../../Domain/shellDomRefs";
import { ShellDomRefs as ShellDomRefsFactory } from "../../../Domain/shellDomRefs";
import { FrameHighlight } from "../FrameHighlight";
import { ShellFrames } from "../../shellFrames";
import type { ShellMutations } from "../../../Domain/Mutations/shellMutations";
import type { ShellSync } from "../../shellSync";
import type { ShellApi } from "../shellApi";
import type { ShellCommands } from "../shellCommands";
import type { ShellRenderSyncCommands } from "../shellRenderSyncCommands";
import { createShellControllerServices } from "./shellServices";
import type { ShellControllerInternals } from "./shellServiceTypes";
import { createShellTemplate } from "../../shellTemplate";
import type { ShellLifecycleContext } from "../Lifecycle/shellLifecycleFlow";

export type ShellControllerParts = {
    refs: ShellDomRefs;
    frames: ShellFrames;
    mutations: ShellMutations;
    sync: ShellSync;
    commands: ShellCommands;
    renderSync: ShellRenderSyncCommands;
    api: ShellApi;
    lifecycle: ShellLifecycleContext;
};

export function createShellControllerParts(host: ShellControllerInternals): ShellControllerParts {
    host.attachShadow({ mode: "open" }).append(createShellTemplate().content.cloneNode(true));
    const refs = new ShellDomRefsFactory(host);
    const frames = new ShellFrames();
    const highlight = new FrameHighlight();
    const stateSessions = new WeakMap<Editor, Map<string, EditableStateSession>>();
    const services = createShellControllerServices(host, refs, frames, highlight, stateSessions);
    return {
        refs,
        frames,
        mutations:  services.mutations,
        sync:       services.sync,
        commands:   services.commands,
        renderSync: services.renderSync,
        api:        services.api,
        lifecycle:  {
            root:       host.shadowRoot!,
            refs,
            events:     services.events,
            commands:   services.commands,
            renderSync: services.renderSync,
            highlight,
            runtime:    () => host._runtime,
            setRuntime: runtime => { host._runtime = runtime; },
        },
    };
}
