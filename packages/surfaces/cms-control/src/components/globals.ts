import { Component } from "@bernouy/components/base";
import { SOURCE_IMAGE_WIDTHS } from "@bernouy/cms-source-images/browser";
import { createResponsiveSourceImageBrowserApi } from "@bernouy/cms-source-images/browser-host";

(window as any).p9r = {
    Component,
    SOURCE_IMAGE_WIDTHS,
    ...createResponsiveSourceImageBrowserApi({ public: false, private: false }),
};
