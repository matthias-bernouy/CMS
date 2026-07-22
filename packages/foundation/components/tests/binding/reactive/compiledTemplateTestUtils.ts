import { CompiledTemplate } from "../../../src/binding/reactive/CompiledTemplate";
import type { FilterMap } from "../../../src/binding/core/interpolate";

export function mount(html: string, scope: unknown, filters: FilterMap = {}) {
    const template = document.createElement("template");
    template.innerHTML = html.trim();
    const host = document.createElement("div");
    const compiled = CompiledTemplate.fromFragment(template.content, filters);
    const region = compiled.mount(host, { value: scope });
    document.body.appendChild(host);
    return { compiled, host, region };
}
