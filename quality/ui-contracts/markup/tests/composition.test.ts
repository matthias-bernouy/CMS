import { expect, test } from "bun:test";
import { inspectMarkup } from "../index";

const path = "packages/surfaces/cms-kernel/src/components/admin/WidgetList.ts";
const inspect = (content: string) => inspectMarkup({ path, content, kind: "script", browser: true });

test("accepts component-owned light-DOM bindings without a private core or stylesheet", () => {
    expect(
        inspect(`class WidgetList extends HTMLElement {
            connectedCallback() {
                this.innerHTML = \`<section cms-query="catalog.widgets:list as widgets">
                    <template cms-repeat="widgets.data as widget">
                        <p9r-card cms-condition="widget.visible">
                            <span>{{ widget.title }}</span>
                        </p9r-card>
                    </template>
                </section>\`;
            }
        }`),
    ).toEqual([]);
});

test("accepts behavior that works directly against an authored Light DOM root", () => {
    expect(
        inspect(`export function mount(root) {
            const button = root.querySelector("button");
            button?.addEventListener("click", () => root.toggleAttribute("open"));
        }`),
    ).toEqual([]);
});

test("rejects a private core in light DOM while recommending valid component composition", () => {
    const [finding] = inspect('this.innerHTML = "<cms-binding-core><widget-list></widget-list></cms-binding-core>";');
    expect(finding).toMatchObject({ rule: "binding-core-owner", severity: "ERROR" });
    expect(finding?.recommendation).toContain("including component-owned children");
    expect(finding?.recommendation).toContain("do not add a private core or component stylesheet to light DOM");
});
