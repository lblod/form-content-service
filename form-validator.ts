import { NamedNode } from 'rdflib';
import { FormDefinition } from './types';
import ForkingStore from 'forking-store';
import { sparqlEscapeUri } from 'mu';
import { QueryEngine } from '@comunica/query-sparql';
import N3 from 'n3';
import { ttlToStore } from './utils';
import { getPathsForFieldsQuery } from './queries/getPathsForFields';

const getPathsForFields = async function (formStore: N3.Store) {
  type PathLink = { predicate: string; node: string };
  const fieldPathStarts: Record<string, PathLink> = {};
  const previousToNext: Record<string, PathLink> = {};

  const results = await getPathsForFieldsQuery(formStore);

  results.forEach((result) => {
    const { predicate, previous, node, field } = result;
    if (!previous) {
      fieldPathStarts[field] = {
        predicate,
        node,
      };
    } else {
      previousToNext[previous] = {
        predicate,
        node,
      };
    }
  });

  const fullPaths: Record<string, string[]> = {};
  Object.keys(fieldPathStarts).forEach((field) => {
    const path = fieldPathStarts[field];
    let current = path;
    const pathSteps: string[] = [];
    while (current) {
      pathSteps.push(current.predicate);
      current = previousToNext[current.node];
      if (!current) {
        fullPaths[field] = pathSteps;
      }
    }
  });
  return fullPaths;
};

const pathToConstructVariables = function (
  path: string[],
  fieldIndex: number,
  instanceUri: string,
) {
  const instance = sparqlEscapeUri(instanceUri);
  const variables = path.map((predicate, index) => {
    const currentOrigin =
      index === 0 ? instance : `?field${fieldIndex}var${index - 1}`;
    if (predicate.startsWith('^')) {
      return `?field${fieldIndex}var${index} ${predicate.substring(
        1,
      )} ${currentOrigin} .`;
    }
    return `${currentOrigin} ${predicate} ?field${fieldIndex}var${index} .`;
  });
  return variables.join('\n');
};

export const buildFormConstructQuery = async function (formTtl, instanceUri) {
  const formStore = await ttlToStore(formTtl);
  const formPaths = await getPathsForFields(formStore);

  const constructVariables = Object.keys(formPaths).map((field, index) => {
    return pathToConstructVariables(formPaths[field], index, instanceUri);
  });
  const constructPaths = constructVariables.map((path) => {
    return `OPTIONAL { ${path} }`;
  });

  return `
    PREFIX form:  <http://lblod.data.gift/vocabularies/forms/>
    PREFIX sh: <http://www.w3.org/ns/shacl#>
    PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

    CONSTRUCT {
      ${constructVariables.join('\n')}
    } WHERE {
      ${constructPaths.join('\n')}
    }
  `;
};

const extractFormDataTtl = async function (
  dataTtl: string,
  formTtl: string,
  instanceUri: string,
) {
  const constructQuery = await buildFormConstructQuery(formTtl, instanceUri);
  const constructStore = await ttlToStore(dataTtl);
  const engine = new QueryEngine();
  const bindings = await engine.queryQuads(constructQuery, {
    sources: [constructStore],
  });
  const quads = await bindings.toArray();
  return new Promise((resolve, reject) => {
    const writer = new N3.Writer({ format: 'text/turtle' });
    writer.addQuads(quads);
    writer.end((error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
  });
};

export const cleanAndValidateFormInstance = async function (
  instanceTtl: string,
  definition: FormDefinition,
  instanceUri: string,
) {
  const definitionTtl = definition.formTtl;
  const store = new ForkingStore();
  const validationGraph = new NamedNode('http://data.lblod.info/validation');
  await store.parse(instanceTtl, validationGraph);

  const parsedTtl = await store.serializeDataMergedGraph(validationGraph);

  const cleanedTtl = await extractFormDataTtl(
    parsedTtl,
    definitionTtl,
    instanceUri,
  );

  return cleanedTtl;
};
