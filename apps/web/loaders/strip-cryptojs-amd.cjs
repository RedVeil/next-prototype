// xrpl-connect bundles CryptoJS, which still has an AMD branch:
// define(["./core"], ...). There is no ./core file. Turbopack treats that
// call as an import. Drop the branch so the CommonJS path is used.
const AMD_BRANCH = 'typeof define == "function" && define.amd ? define(["./core"], r) : '

module.exports = function stripCryptoJsAmd(source) {
  return source.split(AMD_BRANCH).join("")
}
