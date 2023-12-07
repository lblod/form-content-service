import { query, sparqlEscapeString } from "mu";

export const fetchFormDefinitionById = async function (id: string) {
  const result = await query(`
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX sh: <http://www.w3.org/ns/shacl#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

    SELECT ?formDefinition ?formTtl
    WHERE {
      ?formDefinition a ext:GeneratedForm ;
        mu:uuid ${sparqlEscapeString(id)} ;
        ext:ttlCode ?formTtl .
    } LIMIT 1
  `);

  if (result.results.bindings.length) {
    const binding = result.results.bindings[0];
    return {
      formTtl: binding.formTtl.value,
    };
  } else {
    return null;
  }
};
