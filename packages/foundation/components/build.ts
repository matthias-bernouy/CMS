import { rm, mkdir, cp, writeFile } from "node:fs/promises";
import { $ } from "bun";

const dist = "./dist";
const blocsDir = `${dist}/blocs`;

// Each entry is [output-file-basename (kebab-case), entrypoint].
// Kept in sync with src/index.ts. The abstract `Component` base is
// intentionally omitted — it is not instantiable on its own.
const blocs: Array<[string, string]> = [
    ["accordion", "./src/ui/Accordion/Accordion.ts"],
    ["accordion-item", "./src/ui/Accordion/AccordionItem/AccordionItem.ts"],
    ["alert", "./src/ui/Alert/Alert.ts"],
    ["avatar", "./src/ui/Avatar/Avatar.ts"],
    ["badge", "./src/ui/Badge/Badge.ts"],
    ["breadcrumb", "./src/ui/Breadcrumb/Breadcrumb.ts"],
    ["breadcrumb-item", "./src/ui/Breadcrumb/BreadcrumbItem/BreadcrumbItem.ts"],
    ["card", "./src/ui/Card/Card.ts"],
    ["divider", "./src/ui/Divider/Divider.ts"],
    ["form-dialog", "./src/ui/Dialog/FormDialog/FormDialog.ts"],
    ["lateral-dialog", "./src/ui/Dialog/LateralDialog/LateralDialog.ts"],
    ["modal", "./src/ui/Dialog/Modal/Modal.ts"],
    ["open-modal", "./src/ui/Dialog/OpenModal/OpenModal.ts"],
    ["button", "./src/ui/Form/Button/Button.ts"],
    ["checkbox", "./src/ui/Form/Checkbox/Checkbox.ts"],
    ["form-section", "./src/ui/Form/FormSection/FormSection.ts"],
    ["icon-button", "./src/ui/Form/IconButton/IconButton.ts"],
    ["input-file", "./src/ui/Form/InputFile/InputFile.ts"],
    ["p9r-input", "./src/ui/Form/P9rInput/P9rInput.ts"],
    ["p9r-range", "./src/ui/Form/P9rRange/P9rRange.ts"],
    ["p9r-select", "./src/ui/Form/P9rSelect/P9rSelect.ts"],
    ["p9r-sizes-select", "./src/ui/Form/P9rSizesSelect/P9rSizesSelect.ts"],
    ["radio", "./src/ui/Form/Radio/Radio.ts"],
    ["radio-group", "./src/ui/Form/RadioGroup/RadioGroup.ts"],
    ["segmented-switch", "./src/ui/Form/SegmentedSwitch/SegmentedSwitch.ts"],
    ["switch", "./src/ui/Form/Switch/Switch.ts"],
    ["tag-suggest", "./src/ui/Form/TagSuggest/TagSuggest.ts"],
    ["textarea", "./src/ui/Form/Textarea/Textarea.ts"],
    ["horizontal-action-group", "./src/ui/HorizontalActionGroup/HorizontalActionGroup.ts"],
    ["container", "./src/ui/Layout/Container/Container.ts"],
    ["grid", "./src/ui/Layout/Grid/Grid.ts"],
    ["left-menu-layout", "./src/ui/Layout/LeftMenuLayout/LeftMenuLayout.ts"],
    ["photo-album", "./src/ui/Media/PhotoAlbum/PhotoAlbum.ts"],
    ["lateral-menu", "./src/ui/Menu/LateralMenu/LateralMenu.ts"],
    ["lateral-menu-item", "./src/ui/Menu/LateralMenu/LateralMenuItem/LateralMenuItem.ts"],
    ["pagination", "./src/ui/Pagination/Pagination.ts"],
    ["progress", "./src/ui/Progress/Progress.ts"],
    ["skeleton", "./src/ui/Skeleton/Skeleton.ts"],
    ["spinner", "./src/ui/Spinner/Spinner.ts"],
    ["stepper", "./src/ui/Stepper/Stepper.ts"],
    ["step", "./src/ui/Stepper/Step/Step.ts"],
    ["table", "./src/ui/Table/Table.ts"],
    ["table-cell", "./src/ui/Table/Cell/Cell.ts"],
    ["table-header-cell", "./src/ui/Table/HeaderCell/HeaderCell.ts"],
    ["table-row", "./src/ui/Table/Row/Row.ts"],
    ["tabs", "./src/ui/Tabs/Tabs.ts"],
    ["tab-panel", "./src/ui/Tabs/TabPanel/TabPanel.ts"],
    ["tag", "./src/ui/Tag/Tag.ts"],
    ["toast", "./src/ui/Toast/Toast/Toast.ts"],
    ["toast-stack", "./src/ui/Toast/ToastStack/ToastStack.ts"],
    ["tooltip", "./src/ui/Tooltip/Tooltip.ts"],

    ["stat", "./src/ui/Dataviz/Stat/Stat.ts"],
    ["line-chart", "./src/ui/Dataviz/LineChart/LineChart.ts"],
    ["bar-list", "./src/ui/Dataviz/BarList/BarList.ts"],
    ["range-tabs", "./src/ui/Dataviz/RangeTabs/RangeTabs.ts"],
];

async function buildBundle(
    entrypoint: string,
    outdir: string,
    filename: string,
    format: "iife" | "esm",
) {
    const result = await Bun.build({
        entrypoints: [entrypoint],
        outdir,
        target: "browser",
        format,
        minify: true,
        naming: filename,
    });
    if (!result.success) {
        for (const log of result.logs) console.error(log);
        process.exit(1);
    }
}

// Build-time d.ts stub re-exporting the bloc's class from the tsc-emitted
// declarations, so `import { Foo } from "@bernouy/components/blocs/foo"`
// gets types for extension without enumerating every bloc in the exports map.
function dtsStub(entry: string): string {
    const relative = entry.replace(/^\.\/src\//, "").replace(/\.ts$/, "");
    return `export * from "../${relative}";\n`;
}

await rm(dist, { recursive: true, force: true });
await mkdir(blocsDir, { recursive: true });

await buildBundle("./src/base/Component.ts", dist, "base.js", "esm");
await buildBundle("./src/index.ts", dist, "index.js", "esm");

await Promise.all(
    blocs.flatMap(([name, entry]) => [
        buildBundle(entry, blocsDir, `${name}.mjs`, "esm"),
        writeFile(`${blocsDir}/${name}.d.ts`, dtsStub(entry)),
    ]),
);

await cp("./src/assets/default.css", `${dist}/style.css`);

await $`bunx tsc -p tsconfig.build.json`;
await writeFile(`${dist}/base.d.ts`, `export * from "./base/Component";\n`);

console.log(`Built index.js + ${blocs.length} blocs (esm + d.ts) → ${dist}/`);
