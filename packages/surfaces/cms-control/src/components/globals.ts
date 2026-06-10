import { Component } from "@bernouy/cms-blocs/base";
import { Editor, registerEditor, registerEditor_opaque } from "@bernouy/cms-control/editor";
import { P9R_ATTR } from "@bernouy/cms-content/constants";


(window as any).p9r = {
    attr: P9R_ATTR,
    Component,
    Editor,
    registerEditor,
    registerEditor_opaque
}