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
import type { ShellControllerHost } from "./shellServiceTypes";
import {
    createShellState,
    type ShellState,
} from "./shellState";
import { createShellTemplate } from "../../shellTemplate";
import type { ShellLifecycleContext } from "../Lifecycle/shellLifecycleFlow";

export type ShellControllerParts = {
    state: ShellState;
    refs: ShellDomRefs;
    frames: ShellFrames;
    mutations: ShellMutations;
    sync: ShellSync;
    commands: ShellCommands;
    renderSync: ShellRenderSyncCommands;
    api: ShellApi;
    lifecycle: ShellLifecycleContext;
};

export function createShellControllerParts(host: ShellControllerHost): ShellControllerParts {
    host.attachShadow({ mode: "open" }).append(createShellTemplate().content.cloneNode(true));
    const state = createShellState();
    const refs = new ShellDomRefsFactory(host);
    const frames = new ShellFrames();
    const highlight = new FrameHighlight();
    const stateSessions = new WeakMap<Editor, Map<string, EditableStateSession>>();
    const services = createShellControllerServices(host, state, refs, frames, highlight, stateSessions);
    return {
        state,
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
            runtime:    () => state.runtime,
            setRuntime: runtime => { state.runtime = runtime; },
        },
    };
}
