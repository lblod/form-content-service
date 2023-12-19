import { queryStore } from '../utils';
import N3 from 'n3';
import { sparqlEscapeUri } from 'mu';
import { modifierLookup } from '../utils';

const getSimplePaths = async function (
  fieldWhere: string,
  formStore: N3.Store,
) {
  // NOTE: we don't support simple paths with modifiers (e.g. inverse path),
  // in that case, just write it as ( [ sh:inversePath <predicate> ] ) instead of
  // [ sh:inversePath <predicate> ], i.e. make it a complex path
  const query = `
    PREFIX form: <http://lblod.data.gift/vocabularies/forms/>
    PREFIX sh: <http://www.w3.org/ns/shacl#>
    PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

    SELECT ?path ?modifier ?truePredicate ?field WHERE {
      ${fieldWhere}

      OPTIONAL {
        ?formOrListing form:scope ?scope.
        ?scope sh:path ?path.
        FILTER(!isBlank(?path))

        OPTIONAL {
          ?path ?modifier ?truePredicate
        }
      }
    }
  `;
  const bindings = await queryStore(query, formStore);
  return bindings.map((binding) => {
    const path = binding.get('path')?.value;
    const field = binding.get('field')?.value || 'cannot be undefined';
    const modifier = binding.get('modifier')?.value;
    const truePredicate = binding.get('truePredicate')?.value;

    if (!path) {
      // no additional scope found
      return {
        step: undefined,
        predicate: undefined,
        previous: undefined,
        field,
      };
    }

    const sparqlModifier = modifier && modifierLookup[modifier];
    if (modifier && !sparqlModifier) {
      throw new Error(`Unsupported modifier ${modifier}`);
    }
    const realPredicate = sparqlModifier
      ? `${sparqlModifier}${sparqlEscapeUri(truePredicate)}`
      : sparqlEscapeUri(path);

    return {
      step: path,
      predicate: realPredicate,
      previous: undefined,
      field,
    };
  });
};

const getPathHeads = async function (fieldWhere: string, formStore: N3.Store) {
  const query = `
    PREFIX form: <http://lblod.data.gift/vocabularies/forms/>
    PREFIX sh: <http://www.w3.org/ns/shacl#>
    PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

    SELECT ?path ?predicate ?modifier ?truePredicate ?field WHERE {
      ${fieldWhere}

      ?formOrListing form:scope ?scope.
      ?scope sh:path ?path.
      ?path rdf:first ?predicate.
      OPTIONAL {
        ?predicate ?modifier ?truePredicate
      }
    }
`;
  const bindings = await queryStore(query, formStore);
  const modifierLookup = {
    // only inverse path is supported for now
    'http://www.w3.org/ns/shacl#inversePath': '^',
  };
  return bindings.map((binding) => {
    const path = binding.get('path')?.value || 'cannot be undefined';
    const field = binding.get('field')?.value || 'cannot be undefined';
    const predicate = binding.get('predicate')?.value || 'cannot be undefined';
    const modifier = binding.get('modifier')?.value;
    const truePredicate = binding.get('truePredicate')?.value;

    const sparqlModifier = modifier && modifierLookup[modifier];
    if (modifier && !sparqlModifier) {
      throw new Error(`Unsupported modifier ${modifier}`);
    }
    const realPredicate = sparqlModifier
      ? `${sparqlModifier}${sparqlEscapeUri(truePredicate)}`
      : sparqlEscapeUri(predicate);

    return {
      step: path,
      predicate: realPredicate,
      previous: undefined,
      field,
    };
  });
};

const getPathTails = async function (fieldWhere: string, formStore: N3.Store) {
  const query = `
    PREFIX form: <http://lblod.data.gift/vocabularies/forms/>
    PREFIX sh: <http://www.w3.org/ns/shacl#>
    PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

    SELECT ?path ?tail ?previous ?predicate ?modifier ?truePredicate ?field WHERE {
      ${fieldWhere}

      ?formOrListing form:scope ?scope.
      ?scope sh:path ?path.

      ?path rdf:rest+ ?tail.
      ?previous rdf:rest ?tail.
      ?tail rdf:first ?predicate.
      OPTIONAL {
        ?predicate ?modifier ?truePredicate
      }
    }
  `;
  const bindings = await queryStore(query, formStore);
  const modifierLookup = {
    // only inverse path is supported for now
    'http://www.w3.org/ns/shacl#inversePath': '^',
  };
  return bindings.map((binding) => {
    const path = binding.get('path')?.value || 'cannot be undefined';
    const field = binding.get('field')?.value || 'cannot be undefined';
    const previous = binding.get('previous')?.value || 'cannot be undefined';
    const predicate = binding.get('predicate')?.value || 'cannot be undefined';
    const modifier = binding.get('modifier')?.value;
    const truePredicate = binding.get('truePredicate')?.value;

    const sparqlModifier = modifier && modifierLookup[modifier];
    if (modifier && !sparqlModifier) {
      throw new Error(`Unsupported modifier ${modifier}`);
    }
    const realPredicate = sparqlModifier
      ? `${sparqlModifier}${sparqlEscapeUri(truePredicate)}`
      : sparqlEscapeUri(predicate);

    return {
      step: path,
      predicate: realPredicate,
      previous,
      field,
    };
  });
};

/**
 * Were are combining 3 different queries. This is to avoid a bug in the union implementation of comunica.
 * This only works because comunica uses consistent blank node identifiers across queries.
 *
 * NOTE: we currently only support direct fields in generator shapes, not complex paths
 *
 * here,
 * - step is the current step in the path (blank node) (or if a simple path, the predicate)
 * - previous is the previous step in the scope's path if it exists
 * - predicate is the predicate on the current step in the scope's path if it exists, possibly with a ^ modifier
 * - field is the predicate that the generator adds
 *
 */
export const getPathsForGeneratorQuery = async function (formStore: N3.Store) {
  const generatorWhere = `
  ?formOrListing (form:createGenerator|form:initGenerator) ?generator.
      ?generator form:prototype/form:shape ?generatorShape.
  		?generatorShape ?field ?generatorO.
  `;

  const uuidWhere = `
  ?formOrListing (form:createGenerator|form:initGenerator) ?generator.
  ?generator form:dataGenerator form:addMuUuid.
  VALUES (?field) { ( <http://mu.semte.ch/vocabularies/core/uuid> ) }
  `;

  const paths = await Promise.all([
    getSimplePaths(generatorWhere, formStore),
    getPathHeads(generatorWhere, formStore),
    getPathTails(generatorWhere, formStore),
    getSimplePaths(uuidWhere, formStore),
    getPathHeads(uuidWhere, formStore),
    getPathTails(uuidWhere, formStore),
  ]);
  const bindings = paths.flat();
  return bindings;
};
