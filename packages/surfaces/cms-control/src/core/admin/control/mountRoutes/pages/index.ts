import type { Middleware } from "@bernouy/http-runner";
import type { ControlCmsState } from "cms-control/core/admin/control/types";
import { controlUnavailableResponse } from "cms-control/core/admin/control/mountRoutes/unavailable";
import { serveControlBlocset } from "./blocset";
import { controlPagePath } from "./paths";
import { controlPageSnapshot, findControlPage } from "./registry";
import { renderControlPage } from "./render";

export function mountCollectionControlPages(state: ControlCmsState, guards: Middleware[]): void {
    state.runner.group(
        "/admin",
        (adminRunner) => {
            adminRunner.setDefaultEndpoint("GET", (request) => handleControlPage(request, state));
        },
        guards,
    );
    state.runner.addEndpoint("GET", "/.cms/blocset", (request) => serveControlBlocset(request, state), guards);
}

export async function handleControlPage(request: Request, state: ControlCmsState): Promise<Response> {
    try {
        const path = controlPagePath(new URL(request.url).pathname, state.runner.basePath);
        const snapshot = await controlPageSnapshot(state);
        const selected = path && snapshot ? findControlPage(snapshot, path) : null;
        if (!snapshot || !selected) {
            return controlUnavailableResponse();
        }
        return await renderControlPage(request, state, snapshot, selected);
    } catch (error) {
        console.error("Control collection Page failure", {
            errorType: error instanceof Error ? error.name : "UnknownError",
        });
        return controlUnavailableResponse();
    }
}
