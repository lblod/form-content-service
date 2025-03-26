import { NamedNode, Literal, Statement } from 'rdflib';
import { FormDefinition } from './types';
import ForkingStore from 'forking-store';
import { sparqlEscapeUri } from 'mu';
import { QueryEngine } from '@comunica/query-sparql';
import N3 from 'n3';
import { getPathsForFieldsQuery } from './domain/data-access/getPathsForFields';
import { getPathsForGeneratorQuery } from './domain/data-access/getPathsForGenerators';
import { ttlToStore } from './helpers/ttl-helpers';
import {
  DATATYPE,
  PREDICATE,
  updatePredicateInTtl,
} from './utils/update-predicate-in-ttl';

type PathSegment = { predicate?: string; step?: string };
type PathQueryResultItem = PathSegment & { previous?: string; field: string };

const buildPathChain = function (results: PathQueryResultItem[]) {
  const fieldPathStarts: Record<string, PathSegment> = {};
  const previousToNext: Record<string, PathSegment> = {};
  results.forEach((result) => {
    const { predicate, previous, step, field } = result;
    if (!previous) {
      fieldPathStarts[field] = {
        predicate,
        step,
      };
    } else {
      previousToNext[previous] = {
        predicate,
        step,
      };
    }
  });

  return { fieldPathStarts, previousToNext };
};

const getPathsForFields = async function (formStore: N3.Store) {
  const results = await getPathsForFieldsQuery(formStore);
  const { fieldPathStarts, previousToNext } = buildPathChain(results);

  const fullPaths: Record<string, string[]> = {};
  Object.keys(fieldPathStarts).forEach((field) => {
    const path = fieldPathStarts[field];
    let current = path;
    const pathSteps: string[] = [];
    while (current) {
      if (!current.predicate) {
        break; // this can never happen for fields, but it can for generators
      }
      pathSteps.push(current.predicate);
      current = previousToNext[current.step || ''];
      if (!current) {
        fullPaths[field] = pathSteps;
      }
    }
  });
  return fullPaths;
};

const getPathsForGenerators = async function (formStore: N3.Store) {
  const results = await getPathsForGeneratorQuery(formStore);
  const { fieldPathStarts, previousToNext } = buildPathChain(results);

  const fullPaths: Record<string, string[]> = {};
  Object.keys(fieldPathStarts).forEach((field) => {
    const path = fieldPathStarts[field];
    let current: PathSegment = path;
    const pathSteps: string[] = [];
    while (current) {
      const predicate = current.predicate;

      // predicate is null for simple paths without a scope, in that case, we don't want to add this empty node to the path
      if (predicate) {
        pathSteps.push(current.predicate as string);
      }
      current = previousToNext[current.step || ''];
      if (!current) {
        // for this query, the path is the scope (if any) and we should add the predicate to it to get the full path
        fullPaths[field] = [...pathSteps, sparqlEscapeUri(field)];
      }
    }
  });
  return fullPaths;
};

const createPathTriple = (
  currentOrigin: string,
  predicate: string,
  nextVariable: string,
) => {
  return predicate.startsWith('^')
    ? `${nextVariable} ${predicate.substring(1)} ${currentOrigin}.`
    : `${currentOrigin} ${predicate} ${nextVariable}.`;
};

const pathToConstructVariables = function (
  path: string[],
  fieldIndex: number,
  instanceUri: string,
) {
  const instance = sparqlEscapeUri(instanceUri);
  const variables = path.map((predicate, index) => {
    const isFirstPredicate = index === 0;
    let result = '';
    const currentOrigin = isFirstPredicate
      ? instance
      : `?field${fieldIndex}var${index - 1}`;
    const nextVariable = `?field${fieldIndex}var${index}`;
    result += createPathTriple(currentOrigin, predicate, nextVariable);
    if (!isFirstPredicate) {
      // As these triples will be added to the same Optional as the first
      // predicate in this path, if any of the other predicates do not have
      // a mu:uuid or a type, the whole path will be skipped. This is fine
      // because otherwise they would be rejected by mu-auth.
      result += `${currentOrigin} mu:uuid ${nextVariable}Id .
        ${currentOrigin} a ${nextVariable}Type .`;
    }
    return result;
  });
  return variables.join('\n');
};

export type QueryOptions = {
  afterPrefixesSnippet?: string;
  beforeWhereSnippet?: string;
};

export const buildFormConstructQuery = async function (
  formTtl,
  instanceUri,
  options?: QueryOptions,
) {
  return await buildFormQuery(formTtl, instanceUri, 'CONSTRUCT', options);
};

export const buildFormDeleteQuery = async function (
  formTtl: string,
  instanceUri: string,
  options?: QueryOptions,
) {
  return await buildFormQuery(formTtl, instanceUri, 'DELETE', options);
};

export const buildFormQuery = async function (
  formTtl: string,
  instanceUri: string,
  queryType: 'CONSTRUCT' | 'DELETE',
  options?: QueryOptions,
) {
  const formStore = await ttlToStore(formTtl);
  const formPaths = await getPathsForFields(formStore);
  const generatorPaths = await getPathsForGenerators(formStore);
  const allPaths = { ...formPaths, ...generatorPaths };
  const safeInstanceUri = sparqlEscapeUri(instanceUri);

  const constructVariables = Object.keys(allPaths).map((field, index) => {
    return pathToConstructVariables(allPaths[field], index, instanceUri);
  });
  const constructPaths = constructVariables.map((path) => {
    return `OPTIONAL { ${path} }`; // TODO: For virtuoso, a UNION is faster, we may want to replace this BUT UNION is broken by comunica right now
  });

  return `
    PREFIX form:  <http://lblod.data.gift/vocabularies/forms/>
    PREFIX sh: <http://www.w3.org/ns/shacl#>
    PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX dcterms: <http://purl.org/dc/terms/>
    ${options?.afterPrefixesSnippet || ''}
    ${queryType} {
      ${safeInstanceUri} a ?type .
      ${safeInstanceUri} dcterms:modified ?modifiedAt .
      ${constructVariables.join('\n')}
    }
    ${options?.beforeWhereSnippet || ''}
    WHERE {
      ${safeInstanceUri} a ?type .
      OPTIONAL {
        OPTIONAL {
          ${safeInstanceUri} dcterms:modified ?modifiedAt .
        }
        ${constructPaths.join('\n')}
      }
    }
  `;
};

const extractFormDataTtl = async function (
  dataTtl: string,
  formTtl: string,
  instanceUri: string,
): Promise<string> {
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
  if (definition.custom) {
    if (
      !store.any(
        new NamedNode(instanceUri),
        new NamedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
        new NamedNode('http://mu.semte.ch/vocabularies/ext/CustomFormType'),
        validationGraph,
      )
    ) {
      store.addAll([
        new Statement(
          new NamedNode(instanceUri),
          new NamedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
          new NamedNode('http://mu.semte.ch/vocabularies/ext/CustomFormType'),
          validationGraph,
        ),
      ]);
    }
  }

  const parsedTtl = await store.serializeDataMergedGraph(validationGraph);
  const ttlWithModifiedAt = await updatePredicateInTtl(
    new NamedNode(instanceUri),
    PREDICATE.modified,
    new Literal(new Date().toISOString(), undefined, DATATYPE.datetime),
    parsedTtl,
  );

  const cleanedTtl = await extractFormDataTtl(
    ttlWithModifiedAt,
    definitionTtl,
    instanceUri,
  );

  return cleanedTtl;
};
