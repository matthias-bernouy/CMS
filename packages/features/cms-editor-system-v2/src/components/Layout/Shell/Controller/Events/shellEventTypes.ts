import type { FrameHighlight } from "../Core/FrameHighlight";
import type { ShellCommands } from "../Core/shellCommands";
import type { ShellRenderSyncCommands } from "../Core/shellRenderSyncCommands";
import type { ShellDomRefs } from "../../Domain/shellDomRefs";
import type { ShellMutations } from "../../Domain/Mutations/shellMutations";
import type { ShellState } from "../Core/Services/shellState";

export type ShellEventsContext = {
    host: HTMLElement;
    state: ShellState;
    refs: ShellDomRefs;
    mutations: ShellMutations;
    commands: ShellCommands;
    renderSync: ShellRenderSyncCommands;
    highlight: FrameHighlight;
    frameClickTarget(event: Event): Element | null;
};
