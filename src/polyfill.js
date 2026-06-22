// @actual-app/api bundles UAParser which reads navigator at module load time.
// Node has no navigator; this shim prevents the ReferenceError.
if (typeof globalThis.navigator === 'undefined') {
  globalThis.navigator = { userAgent: 'node.js', platform: '' };
}
