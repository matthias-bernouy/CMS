import { afterEach, expect, test } from "bun:test";
import {
    prepareNetworkInertBindings,
    restoreNetworkBindingMarkup,
    writeNetworkBindingAttribute,
} from "../../../src/browser/binding/core/networkBindings";
import { resetDom } from "../support/testUtils";
import { mount } from "../reactive/compiledTemplateTestUtils";

afterEach(resetDom);

test("video URLs resolve safely, update independently and preserve authored references", () => {
    const markup =
        '<video src="{{ film | internalUrl }}" poster="{{ cover | internalUrl }}" controls="{{ native }}" muted="{{ silent }}"><track src="{{ captions | internalUrl }}" kind="captions"></video>';
    const template = document.createElement("template");
    template.innerHTML = markup;
    prepareNetworkInertBindings(template.content);
    expect(template.content.querySelector("[src],[poster]")).toBeNull();
    const { compiled, host, region } = mount(markup, {
        film: "/film.mp4",
        cover: "/cover.webp",
        captions: "/captions.vtt",
        native: true,
        silent: true,
    });
    const video = host.querySelector("video")!;
    expect(video.getAttribute("src")).toBe("/film.mp4");
    expect(video.getAttribute("poster")).toBe("/cover.webp");
    expect(host.querySelector("track")!.getAttribute("src")).toBe("/captions.vtt");
    expect(video.muted).toBeTrue();
    region.update({
        value: {
            film: "/replacement.mp4",
            cover: "https://outside.test/cover",
            captions: "//outside.test/track",
            native: false,
            silent: false,
        },
    });
    expect(video.getAttribute("src")).toBe("/replacement.mp4");
    expect(video.hasAttribute("poster")).toBeFalse();
    expect(host.querySelector("track")!.hasAttribute("src")).toBeFalse();
    expect(video.hasAttribute("controls")).toBeFalse();
    expect(video.muted).toBeFalse();
    expect(compiled.cloneRaw().querySelector("video")!.getAttribute("src")).toBe("{{ film | internalUrl }}");
    expect(compiled.cloneRaw().querySelector("video")!.getAttribute("poster")).toBe("{{ cover | internalUrl }}");
});

test("a pending video URL does not suppress the other static media reference", () => {
    const poster = mount('<video src="/film.mp4" poster="{{ cover | internalUrl }}"></video>', {
        cover: "/cover.webp",
    }).host.querySelector("video")!;
    const film = mount('<video src="{{ film | internalUrl }}" poster="/cover.webp"></video>', {
        film: "/film.mp4",
    }).host.querySelector("video")!;
    for (const video of [poster, film]) {
        expect(video.getAttribute("src")).toBe("/film.mp4");
        expect(video.getAttribute("poster")).toBe("/cover.webp");
    }
    const template = document.createElement("template");
    template.innerHTML = '<video src="{{ film | internalUrl }}" poster="/cover.webp"></video>';
    prepareNetworkInertBindings(template.content);
    const video = template.content.querySelector("video")!;
    expect(video.hasAttribute("src")).toBeFalse();
    writeNetworkBindingAttribute(video, "poster", "/replacement.webp");
    expect(video.getAttribute("poster")).toBe("/replacement.webp");
    restoreNetworkBindingMarkup(template.content);
    expect(video.getAttribute("src")).toBe("{{ film | internalUrl }}");
});
