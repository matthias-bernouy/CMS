import aside from "./aside.html" with { type: "text" };
import condition from "./condition.html" with { type: "text" };
import event from "./event.html" with { type: "text" };
import fn from "./function.html" with { type: "text" };

const templateHtml = [event, condition, fn, aside].join("");

export function appendCreateTemplate(shell: HTMLElement): void {
    const template = document.createElement("template");
    template.innerHTML = templateHtml as unknown as string;
    shell.append(template.content.cloneNode(true));
}
