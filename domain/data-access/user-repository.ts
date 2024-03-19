import { querySudo } from '@lblod/mu-auth-sudo';
import { sparqlEscapeUri } from 'mu';

export const fetchUserIdFromSession = async (sessionUri: string) => {
  const result = await querySudo(`
    PREFIX session: <http://mu.semte.ch/vocabularies/session/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>

    SELECT ?user
    WHERE {
      ${sparqlEscapeUri(sessionUri)} session:account ?account.
      ?user foaf:account ?account.
    } LIMIT 1
  `);

  if (result.results.bindings.length) {
    const binding = result.results.bindings[0];
    return binding.user.value;
  } else {
    return null;
  }
};
