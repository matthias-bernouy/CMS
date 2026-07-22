import { route } from "../../api";
import css from "../styles";
import { appendCreateTemplate } from "../templates";

export function renderCreateShell(host: HTMLElement, state?: string): boolean {
    const style = document.createElement("style");
    style.textContent = css;
    if (state) {
        const message = document.createElement("div");
        message.className = "state";
        message.textContent = state;
        host.replaceChildren(style, message);
        return false;
    }
    const shell = document.createElement("cms-shell-detail");
    shell.className = "create-shell";
    appendCreateTemplate(shell);
    shell.querySelector<HTMLAnchorElement>(".back")!.href = route("/admin/functions");
    host.replaceChildren(style, shell);
    return true;
}
