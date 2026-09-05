// Vite's resolver strips the `node:` prefix from node:sqlite and then cannot find
// it. This shim hands back the real builtin via createRequire, which bypasses
// Vite's module graph entirely. Test-only; the app imports node:sqlite directly.
const { createRequire } = require('node:module');
module.exports = createRequire(__filename)('node:sqlite');
