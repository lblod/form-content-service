import { query, sparqlEscapeString, sparqlEscapeUri, sparqlEscape } from 'mu';
import { InstanceData, InstanceMinimal } from '../../types';
import {
  buildFormConstructQuery,
  buildFormDeleteQuery,
} from '../../form-validator';
import { Quad } from 'n3';
import { ttlToStore } from '../../helpers/ttl-to-store';

export const datatypeNames = {
  'http://www.w3.org/2001/XMLSchema#dateTime': 'dateTime',
  'http://www.w3.org/2001/XMLSchema#date': 'date',
  'http://www.w3.org/2001/XMLSchema#decimal': 'decimal',
  'http://www.w3.org/2001/XMLSchema#integer': 'int',
  'http://www.w3.org/2001/XMLSchema#float': 'float',
  'http://www.w3.org/2001/XMLSchema#boolean': 'bool',
};

const fetchFormTtlById = async (formId: string): Promise<string | null> => {
  const result = await query(`
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX sh: <http://www.w3.org/ns/shacl#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

    SELECT ?formDefinition ?formTtl
    WHERE {
      ?formDefinition a ext:GeneratedForm ;
        mu:uuid ${sparqlEscapeString(formId)} ;
        ext:ttlCode ?formTtl .
    } LIMIT 1
  `);

  if (result.results.bindings.length) {
    const binding = result.results.bindings[0];
    return binding.formTtl.value;
  } else {
    return null;
  }
};

const buildConstructConceptSchemesQuery = (
  conceptSchemeUris: string[],
): string => {
  const uris = conceptSchemeUris.map(sparqlEscapeUri).join(' ');

  return `
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

    CONSTRUCT {
      ?s ?p ?o
    } WHERE {
      ?s skos:inScheme ?scheme.
      VALUES ?scheme { ${uris} }
      ?s ?p ?o.
    }
    `;
};

export const sparqlEscapeObject = (bindingObject): string => {
  const escapeType = datatypeNames[bindingObject.datatype] || 'string';
  return bindingObject.type === 'uri'
    ? sparqlEscapeUri(bindingObject.value)
    : sparqlEscape(bindingObject.value, escapeType);
};

const bindingToTriple = (binding) =>
  `${sparqlEscapeUri(binding.s.value)} ${sparqlEscapeUri(
    binding.p.value,
  )} ${sparqlEscapeObject(binding.o)} .`;

const getConceptSchemeTriples = async (conceptSchemeUris: string[]) => {
  const constructQuery = buildConstructConceptSchemesQuery(conceptSchemeUris);
  const result = await query(constructQuery);
  return result.results.bindings.map(bindingToTriple).join('\n');
};

const fetchFormInstanceById = async (
  formTtl: string,
  instanceUri: string,
): Promise<InstanceData | null> => {
  const constructQuery = await buildFormConstructQuery(formTtl, instanceUri);
  const result = await query(constructQuery);
  const ttl = result.results.bindings.map(bindingToTriple).join('\n');

  if (!ttl) return null;

  return {
    formDataTtl: `@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .\n${ttl}`,
    instanceUri,
  };
};

/**
 * The n3 Quad library's writer is not safe enough, let's use the mu encoding functions
 */
export const quadToString = function (quad: Quad) {
  let object;
  if (quad.object.termType === 'Literal') {
    const datatype = quad.object.datatype;
    const dataTypeName = datatypeNames[datatype.value];
    object = sparqlEscape(quad.object.value, dataTypeName || 'string');
  } else {
    object = sparqlEscapeUri(quad.object.value);
  }
  return `${sparqlEscapeUri(quad.subject.value)} ${sparqlEscapeUri(
    quad.predicate.value,
  )} ${object} .`;
};

const computeInstanceDeltaQuery = async (
  oldInstanceTtl: string,
  newInstanceTtl: string,
) => {
  const oldStore = await ttlToStore(oldInstanceTtl);
  const newStore = await ttlToStore(newInstanceTtl);

  const removed: Quad[] = [];
  const added: Quad[] = [];

  oldStore.forEach(
    (quad) => {
      if (!newStore.has(quad)) {
        removed.push(quad);
      }
    },
    null,
    null,
    null,
    null,
  );

  newStore.forEach(
    (quad) => {
      if (!oldStore.has(quad)) {
        added.push(quad);
      }
    },
    null,
    null,
    null,
    null,
  );

  const remove = `
  DELETE DATA {
    GRAPH <http://mu.semte.ch/graphs/application> {
      ${removed.map((quad) => quadToString(quad)).join('\n')}
    }
  };`;
  const insert = `\nINSERT DATA {
    GRAPH <http://mu.semte.ch/graphs/application> {
      ${added.map((quad) => quadToString(quad)).join('\n')}
    }
  }`;

  let query = '';

  if (removed.length > 0) {
    query += remove;
  }
  if (added.length > 0) {
    query += insert;
  }

  return query.length > 0 ? query : null;
};

const updateFormInstance = async (
  instance, // TODO specify type
  validatedContentTtl: string,
) => {
  const deltaQuery = await computeInstanceDeltaQuery(
    instance.formDataTtl,
    validatedContentTtl,
  );

  if (!deltaQuery) {
    return { instance };
  }

  await query(deltaQuery);
};

/**
 * This is a naive implementation that will not work for data of the format:
 * <#foo> <#bar> """this text talks about somthing. @prefix is a keyword. if left in text like this, it breaks our implementation""" .
 *
 * The text about prefix will be removed from the text and is a keyword will be interpreted as a prefix statement.
 *
 * We probably don't care.
 */
export const ttlToInsert = function (ttl) {
  const lines = ttl.split(/\.\s/);
  const prefixLines = [] as string[];
  const insertLines = [] as string[];

  lines.forEach((line) => {
    const trimmedLine = line.trim();
    if (trimmedLine.toLowerCase().startsWith('@prefix')) {
      prefixLines.push(`PREFIX ${trimmedLine.substring(8)}`);
    } else {
      insertLines.push(trimmedLine);
    }
  });

  return `${prefixLines.join('\n')}

  INSERT DATA {
    ${insertLines.join('.\n')}
  }`;
};

export const addTripleToTtl = function (
  ttl: string,
  s: string,
  p: string,
  o: string,
) {
  // eslint-disable-next-line prettier/prettier
  // prettier-ignore
  return `${ttl} ${sparqlEscapeUri(s)} ${sparqlEscapeUri(p)} ${sparqlEscapeString(o)} .`;
};

const addFormInstance = async (
  validatedContent: string,
  instanceUri: string,
  formLabel: string,
) => {
  const predicate = 'http://mu.semte.ch/vocabularies/ext/label';
  const updatedContent = addTripleToTtl(
    validatedContent,
    instanceUri,
    predicate,
    formLabel,
  );

  await query(ttlToInsert(updatedContent));
};

const deleteFormInstance = async (formTtl: string, instanceUri: string) => {
  const q = await buildFormDeleteQuery(formTtl, instanceUri);
  await query(q);
};

const getFormInstances = async (formLabel: string) => {
  const q = `
    PREFIX inst: <http://data.lblod.info/form-data/instances/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

    SELECT DISTINCT ?uri ?id
    WHERE {
        ?uri ext:label ${sparqlEscapeString(formLabel)} .
        ?uri mu:uuid ?id .
    }
    `;

  const queryResult = await query(q);

  const instance_values: InstanceMinimal[] = [];

  queryResult.results.bindings.map((binding) => {
    const instance = {
      uri: binding.uri.value,
      id: binding.id.value,
      label: formLabel,
    };
    instance_values.push(instance);
  });

  const result = { instances: instance_values };
  return result;
};

const fetchInstanceIdByUri = async (uri: string) => {
  const result = await query(`
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

    SELECT ?id
    WHERE {
      <${uri}> mu:uuid ?id.
    } LIMIT 1
  `);

  if (result.results.bindings.length) {
    const binding = result.results.bindings[0];
    return binding.id.value;
  } else {
    return null;
  }
};

const fetchInstanceUriById = async (id: string) => {
  const result = await query(`
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

    SELECT ?instance
    WHERE {
      ?instance mu:uuid ${sparqlEscapeString(id)} .
    } LIMIT 1
  `);

  if (result.results.bindings.length) {
    const binding = result.results.bindings[0];
    return binding.instance.value;
  } else {
    return null;
  }
};

export default {
  fetchFormTtlById,
  getConceptSchemeTriples,
  fetchFormInstanceById,
  updateFormInstance,
  addFormInstance,
  deleteFormInstance,
  getFormInstances,
  fetchInstanceIdByUri,
  fetchInstanceUriById,
};
