import pageSettingsCss from "../Styles/pageSettings.css" with { type: "text" };
import pageSettingsTagsCss from "../Styles/pageSettingsTags.css" with { type: "text" };
import templateHtml from "../template.html" with { type: "text" };
import componentCss from "../style.css" with { type: "text" };

export function createShellTemplate(): HTMLTemplateElement {
    const template = document.createElement("template");
    template.innerHTML = `<style>${[componentCss, pageSettingsCss, pageSettingsTagsCss]
        .map((css) => String(css))
        .join("\n")}</style>${String(templateHtml)}`;
    return template;
}
