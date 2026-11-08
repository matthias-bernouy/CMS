import { setup, stopped } from "./client.asset.js";

export async function watchOperation(operationId, update) {
    for (let attempt = 0; attempt < 600 && !stopped(); attempt++) {
        const state = await setup("status");
        if (state.status === "completed") {
            return state;
        }
        if (state.operationId === operationId && state.operationStatus === "failed") {
            throw new Error(
                state.errorMessage || "Setup stopped. Your completed steps are saved. Refresh the status to resume.",
            );
        }
        update(state);
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error("Setup continues in the background. Refresh the status to check its progress.");
}

export function showProgress(state) {
    const total = Object.values(state.counts).reduce((sum, count) => sum + count, 0);
    const completed = Object.values(state.completed).reduce((sum, count) => sum + count, 0);
    document.querySelector("#progress-label").textContent =
        state.status === "pending" ? "Verifying the reviewed resources…" : `${completed} of ${total} resources copied`;
    const progress = document.querySelector("#progress-bar");
    if (total) {
        progress.max = total;
        progress.value = completed;
    } else {
        progress.removeAttribute("value");
    }
}
