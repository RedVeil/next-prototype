// xrpl-connect inlines CryptoJS, whose dead AMD branch calls define(["./core"]).
// Turbopack treats that as a real import. The CommonJS branch already runs.
module.exports = function stripCryptoJsAmd(source) {
  return source.replaceAll('define(["./core"], r)', "0")
}
