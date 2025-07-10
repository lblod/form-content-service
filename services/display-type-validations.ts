import { BindingObject, query, sparqlEscapeUri } from 'mu';
import { v4 as uuidv4 } from 'uuid';
import { sparqlEscapeObject } from '../helpers/ttl-helpers';

export async function createDisplayTypeConstraintsTtlForFieldPath(
  fieldPath: string,
  displayTypeUri: string,
) {
  const validationUris = await getValidationUrisForDisplayType(displayTypeUri);
  const ttl = await constructValidationTtlForUris(
    validationUris,
    displayTypeUri,
    fieldPath,
  );

  return {
    hasValidations: validationUris.length >= 1,
    validationUris,
    ttl,
  };
}

async function getValidationUrisForDisplayType(displayTypeUri: string) {
  const result = await query(`
    PREFIX form: <http://lblod.data.gift/vocabularies/forms/>

    SELECT DISTINCT ?validation
    WHERE {
      ${sparqlEscapeUri(displayTypeUri)} form:validatedBy ?validation .
    }  
  `);

  return result.results.bindings.map((b) => b.validation?.value);
}

async function constructValidationTtlForUris(
  validationUris: Array<string>,
  displayTypeUri: string,
  fieldPath: string,
) {
  if (validationUris.length === 0) {
    return '';
  }

  const values = validationUris.map((uri) => {
    const validation = sparqlEscapeUri(uri);
    const newUri = sparqlEscapeUri(`${displayTypeUri}/${uuidv4()}`);

    return `(${validation} ${newUri})`;
  });
  const constructedResult = await query(`
    PREFIX form: <http://lblod.data.gift/vocabularies/forms/>
    PREFIX sh: <http://www.w3.org/ns/shacl#>

    CONSTRUCT {
      ?uri a ?type .
      ?uri form:grouping ?grouping .
      ?uri sh:resultMessage ?resultMessage .
      ?uri sh:path ${sparqlEscapeUri(fieldPath)} .
    } WHERE {
      VALUES (?validation ?uri) { ${values.join('\n')} }

      ?validation a ?type .
      OPTIONAL {    
        ?validation form:grouping ?grouping .
      }
      OPTIONAL {
        ?validation sh:resultMessage ?resultMessage .
      }
    }
  `);

  const bindingToTriple = (binding: BindingObject) =>
    `${sparqlEscapeUri(binding.s.value)} ${sparqlEscapeUri(
      binding.p.value,
    )} ${sparqlEscapeObject(binding.o)} .`;

  return constructedResult.results.bindings.map(bindingToTriple).join('\n');
}
