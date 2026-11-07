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
    document.querySelector("#progress-label").textContent =
        state.status === "pending"
            ? "Verifying the reviewed resources…"
            : `${state.completedPages} of ${state.totalPages} pages completed`;
    const progress = document.querySelector("#progress-bar");
    if (state.totalPages) {
        progress.max = state.totalPages;
        progress.value = state.completedPages;
    } else {
        progress.removeAttribute("value");
    }
}
