import { queryStore } from '../utils';
import N3 from 'n3';
import { sparqlEscapeUri } from 'mu';
import { modifierLookup } from '../utils';

/**
 * Broken: union only returns the first branch in this query (but works in smaller example)
 */
export const getPathsForFieldsQuerySingleQuery = async function (
  formStore: N3.Store,
) {
  /**
   * here,
   * - ?field is the form:field we're examining the path for
   * - ?previous is the previous step in the path
   * - ?step is the current step in the path (blank node)
   * - ?node is the current predicate in the path UNLESS a modifier is applied, then it's a blank node
   * - ?modifier is the modifier applied to the current predicate in the path if any
   * - ?predicate is the predicate in the path if there is a modifier applied to it (e.g. inverse path)
   *
   * for instance, if the path has this shape:
   * fields:1 sh:path ( [ sh:inversePath prov:generated ] dct:subject [ sh:inversePath besluit:behandelt ]  prov:startedAtTime ) ;
   * the result will be:
   * "field","previous","step","node","modifier","predicate"
   * "fields:1",,"nodeID://b10098","nodeID://b10099","sh:inversePath","prov:generated"
   * "fields:1","nodeID://b10100","nodeID://b10101","nodeID://b10102","sh:inversePath","besluit:behandelt"
   * "fields:1","nodeID://b10098","nodeID://b10100","dct:subject",,
   * "fields:1","nodeID://b10101","nodeID://b10103","prov:startedAtTime",,
   */
  const query = `
    PREFIX form:  <http://lblod.data.gift/vocabularies/forms/>
    PREFIX sh: <http://www.w3.org/ns/shacl#>
    PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

    SELECT
    ?field ?previous ?step ?node ?modifier ?predicate
    WHERE {
      ?field a form:Field.
      ?field sh:path ?path.

      {
        {
          # simple paths with direct predicates
          # (need to repeat previous condition because else our union block is empty)
          ?field sh:path ?path.
          BIND(?path as ?step)
          BIND(?path as ?node)
          FILTER(!isBlank(?step))
        } UNION {
          # first step of a complex path (blank node)
          ?path rdf:first ?node.
          BIND(?path as ?step)
        } UNION {
          # mid or last step of a complex path (blank node)
          ?path rdf:rest+ ?step.
          FILTER(?step != rdf:nil)
          ?step rdf:first ?node.
          ?previous rdf:rest ?step.
        }
      }
      OPTIONAL {
        ?node ?modifier ?predicate.
      }
    } ORDER BY ?field ?step
  `;
  const bindings = await queryStore(query, formStore);
  return bindings.map((binding) => {
    const field = binding.get('field')?.value || 'cannot be undefined';
    const previous = binding.get('previous')?.value;
    const step = binding.get('step')?.value || 'cannot be undefined';
    const node = binding.get('node')?.value || 'cannot be undefined';
    const modifier = binding.get('modifier')?.value;
    const predicate = binding.get('predicate')?.value;

    const sparqlModifier = modifier && modifierLookup[modifier];
    if (modifier && !sparqlModifier) {
      throw new Error(`Unsupported modifier ${modifier}`);
    }
    const realPredicate = sparqlModifier
      ? `${sparqlModifier}${sparqlEscapeUri(predicate)}`
      : sparqlEscapeUri(node);

    return {
      field,
      predicate: realPredicate,
      previous,
      node: step,
    };
  });
};

const getSimplePaths = async function (formStore: N3.Store) {
  const query = `
    PREFIX form:  <http://lblod.data.gift/vocabularies/forms/>
    PREFIX sh: <http://www.w3.org/ns/shacl#>
    PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

    SELECT
    ?field ?path
    WHERE {
      ?field a form:Field.
      ?field sh:path ?path.
      # simple paths with direct predicates
      ?field sh:path ?path.
      FILTER(!isBlank(?path))
    }
  `;
  const bindings = await queryStore(query, formStore);
  return bindings.map((binding) => {
    const field = binding.get('field')?.value || 'cannot be undefined';
    const path = binding.get('path')?.value || 'cannot be undefined';

    const predicate = sparqlEscapeUri(path);

    return {
      field,
      predicate,
      previous: undefined,
      node: path,
    };
  });
};

const getComplexPathHeads = async function (formStore: N3.Store) {
  const query = `
    PREFIX form:  <http://lblod.data.gift/vocabularies/forms/>
    PREFIX sh: <http://www.w3.org/ns/shacl#>
    PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

    SELECT
    ?field ?path ?node ?modifier ?predicate
    WHERE {
      ?field a form:Field.
      ?field sh:path ?path.

      # first step of a complex path (blank node)
      ?path rdf:first ?node.
      OPTIONAL {
        ?node ?modifier ?predicate.
      }
    }
  `;
  const bindings = await queryStore(query, formStore);
  return bindings.map((binding) => {
    const field = binding.get('field')?.value || 'cannot be undefined';
    const step = binding.get('path')?.value || 'cannot be undefined';
    const node = binding.get('node')?.value || 'cannot be undefined';
    const modifier = binding.get('modifier')?.value;
    const predicate = binding.get('predicate')?.value;

    const sparqlModifier = modifier && modifierLookup[modifier];
    if (modifier && !sparqlModifier) {
      throw new Error(`Unsupported modifier ${modifier}`);
    }
    const realPredicate = sparqlModifier
      ? `${sparqlModifier}${sparqlEscapeUri(predicate)}`
      : sparqlEscapeUri(node);

    return {
      field,
      predicate: realPredicate,
      previous: undefined,
      node: step,
    };
  });
};

const getComplexPathsTails = async function (formStore: N3.Store) {
  const query = `
    PREFIX form:  <http://lblod.data.gift/vocabularies/forms/>
    PREFIX sh: <http://www.w3.org/ns/shacl#>
    PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

    SELECT
    ?field ?previous ?step ?node ?modifier ?predicate
    WHERE {
      ?field a form:Field.
      ?field sh:path ?path.
      # mid or last step of a complex path (blank node)
      ?path rdf:rest+ ?step.
      FILTER(?step != rdf:nil)
      ?step rdf:first ?node.
      ?previous rdf:rest ?step.
      OPTIONAL {
        ?node ?modifier ?predicate.
      }
    } ORDER BY ?field ?step
  `;
  const bindings = await queryStore(query, formStore);
  return bindings.map((binding) => {
    const field = binding.get('field')?.value || 'cannot be undefined';
    const previous = binding.get('previous')?.value;
    const step = binding.get('step')?.value || 'cannot be undefined';
    const node = binding.get('node')?.value || 'cannot be undefined';
    const modifier = binding.get('modifier')?.value;
    const predicate = binding.get('predicate')?.value;

    const sparqlModifier = modifier && modifierLookup[modifier];
    if (modifier && !sparqlModifier) {
      throw new Error(`Unsupported modifier ${modifier}`);
    }
    const realPredicate = sparqlModifier
      ? `${sparqlModifier}${sparqlEscapeUri(predicate)}`
      : sparqlEscapeUri(node);

    return {
      field,
      predicate: realPredicate,
      previous,
      node: step,
    };
  });
};

/**
 * Were are combining 3 different queries. This is to avoid a bug in the union implementation of comunica.
 * This only works because comunica uses consistent blank node identifiers across queries.
 *
 * here,
 * - ?field is the form:field we're examining the path for
 * - ?previous is the previous step in the path
 * - ?step is the current step in the path (blank node)
 * - ?node is the current predicate in the path UNLESS a modifier is applied, then it's a blank node
 * - ?modifier is the modifier applied to the current predicate in the path if any
 * - ?predicate is the predicate in the path if there is a modifier applied to it (e.g. inverse path)
 *
 * for instance, if the path has this shape:
 * fields:1 sh:path ( [ sh:inversePath prov:generated ] dct:subject [ sh:inversePath besluit:behandelt ]  prov:startedAtTime ) ;
 * the result will be:
 * "field","previous","step","node","modifier","predicate"
 * "fields:1",,"nodeID://b10098","nodeID://b10099","sh:inversePath","prov:generated"
 * "fields:1","nodeID://b10100","nodeID://b10101","nodeID://b10102","sh:inversePath","besluit:behandelt"
 * "fields:1","nodeID://b10098","nodeID://b10100","dct:subject",,
 * "fields:1","nodeID://b10101","nodeID://b10103","prov:startedAtTime",,
 */
export const getPathsForFieldsQuery = async function (formStore: N3.Store) {
  const [simple, heads, tails] = await Promise.all([
    getSimplePaths(formStore),
    getComplexPathHeads(formStore),
    getComplexPathsTails(formStore),
  ]);
  const bindings = [...simple, ...heads, ...tails];
  return bindings;
};
