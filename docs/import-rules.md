### RULE: IMPORT PATHS & PACKAGE ARCHITECTURE

When writing or refactoring code in this project, strictly follow these rules for imports and path resolution:

**1. Use Path Aliases / Package Names (No relative paths)**
Never use complex relative paths (e.g., `../../`). Always use absolute imports from the root of the project using path aliases (like `@/` or `src/`), or use the package's own name.
* ❌ BAD: `import { helper } from '../../utils/helper';`
* ✅ GOOD: `import { helper } from '@/utils/helper';`

**2. Never use `__dirname` for relative navigation**
When serving static folders or resolving paths, do not use `__dirname` combined with relative navigation (it breaks during build/packaging in ESM). Resolve paths from the project/package root.
* ❌ BAD: `serveApi(join(__dirname, "../../api/admin"));`
* ✅ GOOD: `serveApi(join(packageRoot, "api/admin"));` *(Assuming packageRoot is correctly resolved via import.meta or process.cwd)*
You can create a constants.ts file in the package to export the root path if needed.

**3. Strict adherence to package `exports`**
When developing a package (e.g., `StorageProvider`), if you need to import files or sub-modules that are part of the package's public or internal API, you MUST include them in the `package.json` `"exports"` field. Import them using the package name, acting as a consumer. Do not bypass the exports boundary.
* ❌ BAD: `import { Repository } from '../../../StorageProvider/src/infrastructure/repo';`
* ✅ GOOD: `import { Repository } from 'StorageProvider/infrastructure';` *(Provided `"./infrastructure"` is declared in the package's exports)*