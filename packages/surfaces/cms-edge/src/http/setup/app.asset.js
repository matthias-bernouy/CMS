import { request, setup, stopped } from "./client.asset.js";
import { repositoryStep } from "./repository.asset.js";
import { renderReview } from "./review.asset.js";
import { watchOperation, showProgress } from "./progress.asset.js";

const $ = (selector) => document.querySelector(selector);
let review;
let resumeState;
let cursor = "";
const repository = repositoryStep(run, stage, async () => stage("choice"));

function stage(id) {
    for (const section of document.querySelectorAll(".stage")) {
        section.hidden = section.id !== id;
    }
    const step = ["login", "repository"].includes(id) ? id : ["choice", "recipes"].includes(id) ? "choice" : "review";
    for (const item of document.querySelectorAll("[data-step]")) {
        if (item.dataset.step === step) {
            item.setAttribute("aria-current", "step");
        } else {
            item.removeAttribute("aria-current");
        }
    }
    $("#sign-out").hidden = ["loading", "login"].includes(id);
}
async function run(operation) {
    $("#error").hidden = true;
    $("main").setAttribute("aria-busy", "true");
    for (const button of document.querySelectorAll("button")) {
        button.disabled = true;
    }
    try {
        await operation();
    } catch (error) {
        if (!stopped()) {
            $("#error").textContent = error.message;
            $("#error").hidden = false;
            $("#refresh").hidden = false;
        }
    } finally {
        $("main").setAttribute("aria-busy", "false");
        for (const button of document.querySelectorAll("button")) {
            button.disabled = false;
        }
    }
}
function complete(state) {
    stage("done");
    $("#refresh").hidden = true;
    $("#done-description").textContent = state.redirectPath
        ? "Your starting point is installed. Make it yours."
        : "Your site is empty. Add your first collection and pages whenever you are ready.";
    const link = $("#open-site");
    link.hidden = !state.redirectPath;
    if (state.redirectPath?.startsWith("/") && !state.redirectPath.startsWith("//")) {
        link.href = state.redirectPath;
    }
}
async function monitor(operationId) {
    stage("progress");
    $("#resume").hidden = true;
    complete(await watchOperation(operationId, showProgress));
}
async function loadState(authenticated = false) {
    let state;
    try {
        state = await setup("status");
    } catch (error) {
        if ([401, 403].includes(error.status)) {
            stage("login");
            if (authenticated) {
                throw new Error("Sign in with an administrator account to configure this site.");
            }
            return;
        }
        if (error.status === 404) {
            stage("unavailable");
            return;
        }
        throw error;
    }
    resumeState = state;
    if (state.status === "completed") {
        complete(state);
        return;
    }
    if (state.status === "unavailable") {
        stage("unavailable");
        return;
    }
    if (["queued", "running"].includes(state.operationStatus)) {
        await monitor(state.operationId);
        return;
    }
    if (state.status === "running") {
        stage("progress");
        showProgress(state);
        $("#resume").hidden = false;
        return;
    }
    await repository.open();
}
async function choose(root) {
    $("#refresh").hidden = true;
    const result = await setup("plan", "QUERY", { root });
    review = JSON.parse(result.reviewJson);
    renderReview(review);
    stage("review");
}
async function recipes(append = false) {
    stage("recipes");
    if (!append) {
        cursor = "";
        $("#recipe-list").replaceChildren();
    }
    const page = await setup("recipes", "QUERY", { cursor });
    cursor = page.cursor;
    for (const item of page.items) {
        const button = document.createElement("button");
        button.className = "recipe";
        button.type = "button";
        for (const [tag, text] of [
            ["strong", item.label],
            ["span", item.description],
            ["small", `${item.root.collectionId} · ${item.root.version}`],
        ]) {
            const element = document.createElement(tag);
            element.textContent = text;
            button.append(element);
        }
        button.addEventListener("click", () => run(() => choose(item.root)));
        $("#recipe-list").append(button);
    }
    $("#more").hidden = !cursor;
    $("#no-recipes").hidden = $("#recipe-list").children.length > 0;
}
$("#login-form").addEventListener("submit", (event) => {
    event.preventDefault();
    void run(async () => {
        try {
            await request("cms.access/login-password", "POST", {
                email: $("#email").value,
                password: $("#password").value,
            });
        } finally {
            $("#password").value = "";
        }
        await loadState(true);
    });
});
$("#apply-form").addEventListener("submit", (event) => {
    event.preventDefault();
    void run(async () => {
        const operation = await setup(
            "apply",
            "POST",
            { root: review.plan.root, locale: review.plan.locale, planDigest: review.digest },
            true,
        );
        await monitor(operation.operationId);
    });
});
$("#resume").addEventListener("click", () =>
    run(async () => {
        const operation = await setup(
            "apply",
            "POST",
            { root: JSON.parse(resumeState.rootJson), locale: resumeState.locale, planDigest: resumeState.planDigest },
            true,
        );
        await monitor(operation.operationId);
    }),
);
$("#empty").addEventListener("click", () => run(() => choose(null)));
$("#browse").addEventListener("click", () => run(() => recipes()));
$("#more").addEventListener("click", () => run(() => recipes(true)));
$("#refresh").addEventListener("click", () => run(loadState));
$("#sign-out").addEventListener("click", () =>
    run(async () => {
        await request("cms.access/logout", "POST", {});
        stage("login");
    }),
);
for (const button of document.querySelectorAll("[data-back]")) {
    button.addEventListener("click", () => stage("choice"));
}
void run(loadState);
