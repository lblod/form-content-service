// Override with your own file via volumes that has the same function signature.

/* get the conceptSchemes referenced in a form and the already fetched triples as bindings with vars `s`, `p` and `o`:
 * [  {
 *   "s": { "type": "uri", "value": "..." },
 *   "p": { "type": "uri", "value": "..." },
 *   "o": { "type": "...", "value": "..." }
 * }, { ... }  ]
 *
 * return adjusted list of triples (in same bindings format).
 */
export async function interceptorGetConceptSchemeTriples(
  conceptSchemeUrisList,
  fetchedSpoBindings,
) {
  return fetchedSpoBindings;
}
