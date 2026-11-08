import { setup, stopped } from "./client.asset.js";
const $ = (selector) => document.querySelector(selector);
const active = (state) => ["queued", "running"].includes(state.creationStatus);

export function repositoryStep(run, stage, proceed) {
    let state;
    async function open() {
        state = await setup("repository");
        if (state.configured && !active(state)) {
            await proceed();
            return;
        }
        await show(state);
    }
    async function show(current) {
        state = current ?? (await setup("repository"));
        stage("repository");
        $("#repository-url").value = state.url;
        $("#repository-form").hidden = true;
        $("#repository-resume").hidden = state.creationStatus !== "failed";
        $("#repository-progress").hidden = !state.errorMessage && !active(state);
        $("#repository-progress").textContent = state.errorMessage || "Creating your Repository…";
    }
    async function configure(url) {
        state = await setup("repository", "POST", { expectedRevision: state.revision, url });
        await proceed();
    }
    async function create() {
        $("#repository-progress").hidden = false;
        $("#repository-progress").textContent = "Creating your Repository…";
        try {
            state = await setup("repository/create", "POST", { expectedRevision: state.revision });
            await proceed();
        } catch (error) {
            // The durable transition may finish after the HTTP connection is lost.
            for (let attempt = 0; attempt < 120 && !stopped(); attempt++) {
                let latest;
                try {
                    latest = await setup("repository");
                } catch (statusError) {
                    if (![401, 503].includes(statusError.status)) {
                        throw statusError;
                    }
                }
                if (latest) {
                    state = latest;
                    if (
                        state.creationStatus === "succeeded" &&
                        state.repositoryEnabled &&
                        state.configured &&
                        state.url === location.origin
                    ) {
                        await proceed();
                        return;
                    }
                    if (!active(state)) {
                        await show(state);
                        throw error;
                    }
                }
                await new Promise((resolve) => setTimeout(resolve, 1000));
            }
            throw new Error("Repository creation continues in the background. Refresh its status to check progress.");
        }
    }
    $("#repository-address").addEventListener("click", () => {
        $("#repository-form").hidden = false;
        $("#repository-url").focus();
    });
    $("#repository-official").addEventListener("click", () => run(() => configure("https://repo.ulvia.fr")));
    $("#repository-new").addEventListener("click", () => run(create));
    $("#repository-resume").addEventListener("click", () => run(create));
    $("#change-repository").addEventListener("click", () => run(() => show()));
    $("#repository-form").addEventListener("submit", (event) => {
        event.preventDefault();
        void run(() => configure($("#repository-url").value));
    });
    return { open };
}
