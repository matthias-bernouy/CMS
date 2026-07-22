import aside from "./aside.html" with { type: "text" };
import general from "./general.html" with { type: "text" };
import input from "./input.html" with { type: "text" };
import result from "./return.html" with { type: "text" };
import workflow from "./workflow.html" with { type: "text" };

const templateHtml = [general, input, workflow, result, aside].join("");

export function appendCreateTemplate(shell: HTMLElement): void {
    const template = document.createElement("template");
    template.innerHTML = templateHtml as unknown as string;
    shell.append(template.content.cloneNode(true));
}
