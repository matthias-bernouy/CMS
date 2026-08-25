import { rm, mkdir, cp, writeFile } from "node:fs/promises";
import { $ } from "bun";

const dist = "./dist";
const blocsDir = `${dist}/blocs`;

// Each entry is [output-file-basename (kebab-case), entrypoint].
// Kept in sync with src/index.ts. The abstract `Component` base is
// intentionally omitted — it is not instantiable on its own.
export const blocEntries: ReadonlyArray<readonly [string, string]> = [
    ["accordion", "./src/ui/Content/Accordion/Accordion.ts"],
    ["accordion-item", "./src/ui/Content/Accordion/AccordionItem/AccordionItem.ts"],
    ["alert", "./src/ui/Feedback/Alert/Alert.ts"],
    ["avatar", "./src/ui/DataDisplay/Avatar/Avatar.ts"],
    ["badge", "./src/ui/Feedback/Badge/Badge.ts"],
    ["breadcrumb", "./src/ui/Navigation/Breadcrumb/Breadcrumb.ts"],
    ["breadcrumb-item", "./src/ui/Navigation/Breadcrumb/BreadcrumbItem/BreadcrumbItem.ts"],
    ["card", "./src/ui/Content/Card/Card.ts"],
    ["divider", "./src/ui/Content/Divider/Divider.ts"],
    ["form-dialog", "./src/ui/Feedback/Dialog/FormDialog/FormDialog.ts"],
    ["lateral-dialog", "./src/ui/Feedback/Dialog/LateralDialog/LateralDialog.ts"],
    ["modal", "./src/ui/Feedback/Dialog/Modal/Modal.ts"],
    ["open-modal", "./src/ui/Feedback/Dialog/OpenModal/OpenModal.ts"],
    ["button", "./src/ui/Form/Actions/Button/Button.ts"],
    ["checkbox", "./src/ui/Form/Toggles/Checkbox/Checkbox.ts"],
    ["combobox", "./src/ui/Form/Selection/Combobox/Combobox.ts"],
    ["form-section", "./src/ui/Form/Structure/FormSection/FormSection.ts"],
    ["icon-button", "./src/ui/Form/Actions/IconButton/IconButton.ts"],
    ["input-file", "./src/ui/Form/Inputs/InputFile/InputFile.ts"],
    ["p9r-input", "./src/ui/Form/Inputs/P9rInput/P9rInput.ts"],
    ["p9r-range", "./src/ui/Form/Inputs/P9rRange/P9rRange.ts"],
    ["p9r-select", "./src/ui/Form/Selection/P9rSelect/P9rSelect.ts"],
    ["p9r-sizes-select", "./src/ui/Form/Selection/P9rSizesSelect/P9rSizesSelect.ts"],
    ["radio", "./src/ui/Form/Toggles/Radio/Radio.ts"],
    ["radio-group", "./src/ui/Form/Toggles/RadioGroup/RadioGroup.ts"],
    ["segmented-switch", "./src/ui/Form/Toggles/SegmentedSwitch/SegmentedSwitch.ts"],
    ["switch", "./src/ui/Form/Toggles/Switch/Switch.ts"],
    ["tag-suggest", "./src/ui/Form/Selection/TagSuggest/TagSuggest.ts"],
    ["textarea", "./src/ui/Form/Inputs/Textarea/Textarea.ts"],
    ["token-input", "./src/ui/Form/Inputs/TokenInput/TokenInput.ts"],
    ["horizontal-action-group", "./src/ui/Layout/HorizontalActionGroup/HorizontalActionGroup.ts"],
    ["container", "./src/ui/Layout/Container/Container.ts"],
    ["grid", "./src/ui/Layout/Grid/Grid.ts"],
    ["left-menu-layout", "./src/ui/Layout/LeftMenuLayout/LeftMenuLayout.ts"],
    ["photo-album", "./src/ui/DataDisplay/Media/PhotoAlbum/PhotoAlbum.ts"],
    ["action-menu", "./src/ui/Navigation/Menu/ActionMenu/ActionMenu.ts"],
    ["action-menu-item", "./src/ui/Navigation/Menu/ActionMenu/ActionMenuItem/ActionMenuItem.ts"],
    ["action-menu-section", "./src/ui/Navigation/Menu/ActionMenu/ActionMenuSection/ActionMenuSection.ts"],
    ["lateral-menu", "./src/ui/Navigation/Menu/LateralMenu/LateralMenu.ts"],
    ["lateral-menu-item", "./src/ui/Navigation/Menu/LateralMenu/LateralMenuItem/LateralMenuItem.ts"],
    ["pagination", "./src/ui/Navigation/Pagination/Pagination.ts"],
    ["progress", "./src/ui/Feedback/Progress/Progress.ts"],
    ["skeleton", "./src/ui/Feedback/Skeleton/Skeleton.ts"],
    ["spinner", "./src/ui/Feedback/Spinner/Spinner.ts"],
    ["stepper", "./src/ui/Navigation/Stepper/Stepper.ts"],
    ["step", "./src/ui/Navigation/Stepper/Step/Step.ts"],
    ["table", "./src/ui/DataDisplay/Table/Table.ts"],
    ["table-cell", "./src/ui/DataDisplay/Table/Cell/Cell.ts"],
    ["table-header-cell", "./src/ui/DataDisplay/Table/HeaderCell/HeaderCell.ts"],
    ["table-row", "./src/ui/DataDisplay/Table/Row/Row.ts"],
    ["tabs", "./src/ui/Navigation/Tabs/Tabs.ts"],
    ["tab-panel", "./src/ui/Navigation/Tabs/TabPanel/TabPanel.ts"],
    ["tag", "./src/ui/Content/Tag/Tag.ts"],
    ["toast", "./src/ui/Feedback/Toast/Toast/Toast.ts"],
    ["toast-stack", "./src/ui/Feedback/Toast/ToastStack/ToastStack.ts"],
    ["tooltip", "./src/ui/Content/Tooltip/Tooltip.ts"],

    ["stat", "./src/ui/DataDisplay/Dataviz/Stat/Stat.ts"],
    ["line-chart", "./src/ui/DataDisplay/Dataviz/LineChart/LineChart.ts"],
    ["bar-list", "./src/ui/DataDisplay/Dataviz/BarList/BarList.ts"],
    ["range-tabs", "./src/ui/DataDisplay/Dataviz/RangeTabs/RangeTabs.ts"],
];

type BundleBuildOptions = {
    entrypoints: string[];
    outdir: string;
    target: "browser";
    format: "iife" | "esm";
    minify: boolean;
    naming: string;
};

type BundleBuilder = (options: BundleBuildOptions) => Promise<{ success: boolean; logs: readonly unknown[] }>;

export async function buildBundle(
    entrypoint: string,
    outdir: string,
    filename: string,
    format: "iife" | "esm",
    builder: BundleBuilder = Bun.build,
): Promise<void> {
    const result = await builder({
        entrypoints: [entrypoint],
        outdir,
        target: "browser",
        format,
        minify: true,
        naming: filename,
    });
    if (!result.success) {
        for (const log of result.logs) {
            console.error(log);
        }
        throw new Error(`Failed to build ${entrypoint}`);
    }
}

// Build-time d.ts stub re-exporting the bloc's class from the tsc-emitted
// declarations, so `import { Foo } from "@bernouy/components/blocs/foo"`
// gets types for extension without enumerating every bloc in the exports map.
export function declarationStub(entry: string): string {
    const relative = entry.replace(/^\.\/src\//, "").replace(/\.ts$/, "");
    return `export * from "../${relative}";\n`;
}

export async function buildComponents(): Promise<void> {
    await rm(dist, { recursive: true, force: true });
    await mkdir(blocsDir, { recursive: true });

    await buildBundle("./src/base/index.ts", dist, "base.js", "esm");
    await buildBundle("./binding.ts", dist, "binding.js", "esm");
    await buildBundle("./src/base/compositionRuntime.ts", dist, "composition-runtime.js", "esm");
    await buildBundle("./src/binding/core/networkBindings.ts", dist, "binding-dom.js", "esm");
    await buildBundle("./src/index.ts", dist, "index.js", "esm");

    await Promise.all(
        blocEntries.flatMap(([name, entry]) => [
            buildBundle(entry, blocsDir, `${name}.mjs`, "esm"),
            writeFile(`${blocsDir}/${name}.d.ts`, declarationStub(entry)),
        ]),
    );

    await cp("./src/assets/default.css", `${dist}/style.css`);

    await $`bunx tsc -p src/tooling/tsconfig.build.json`;
    await Promise.all([
        cp("./src/binding/reactive/templatePlan.d.ts", `${dist}/binding/reactive/templatePlan.d.ts`),
        cp("./src/binding/submit/types.d.ts", `${dist}/binding/submit/types.d.ts`),
    ]);
    await writeFile(`${dist}/base.d.ts`, `export * from "./base/index";\n`);

    console.log(`Built index.js + ${blocEntries.length} blocs (esm + d.ts) → ${dist}/`);
}

if (import.meta.main) {
    await buildComponents();
}
