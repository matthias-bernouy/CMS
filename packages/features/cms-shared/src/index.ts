/**
 * @bernouy/cms-shared — last survivor of the dissolved grab-bag: the bloc
 * compile pipeline only (`prepare_bloc`, `validateBloc`,
 * `p9rExternalsPlugin`). Slated to become `cms-bloc-compile` once the
 * `prepare_bloc` → cms-control editor-registration inversion is designed.
 */

export { prepare_bloc }                  from "cms-shared/blocs/prepare_bloc";
export { validateBloc, validateBlocTag } from "cms-shared/blocs/validateBloc";
export { p9rExternalsPlugin }            from "cms-shared/blocs/p9rExternalsPlugin";
