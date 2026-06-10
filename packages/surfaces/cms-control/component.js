"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Component = void 0;
/**
 * @bernouy/cms — view-side authoring entry point.
 *
 * `Bloc.ts` files import `Component` from `@bernouy/cms/component`.
 * This entry deliberately re-exports *only* the base class needed to author
 * the view side of a bloc. Nothing editor-related (Editor, registerEditor,
 * ObserverManager, …) is reachable from this entry — even transitively — so
 * the bundle that visitors download never contains editor code.
 */
var Component_1 = require("cms-control/core/editorSystem/Component");
Object.defineProperty(exports, "Component", { enumerable: true, get: function () { return Component_1.Component; } });
