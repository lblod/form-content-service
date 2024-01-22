import { query, sparqlEscapeString, sparqlEscapeUri } from 'mu';
import { InstanceData, InstanceMinimal } from '../../types';
import {
  buildFormConstructQuery,
  buildFormDeleteQuery,
} from '../../form-validator';
import {
  addTripleToTtl,
  computeInstanceDeltaQuery,
  sparqlEscapeObject,
  ttlToInsert,
} from '../../helpers/ttl-helpers';

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

const bindingToTriple = (binding) =>
  `${sparqlEscapeUri(binding.s.value)} ${sparqlEscapeUri(
    binding.p.value,
  )} ${sparqlEscapeObject(binding.o)} .`;

const getConceptSchemeTriples = async (conceptSchemeUris: string[]) => {
  const constructQuery = buildConstructConceptSchemesQuery(conceptSchemeUris);
  const result = await query(constructQuery);
  return result.results.bindings.map(bindingToTriple).join('\n');
};

const fetchFormInstanceByUri = async (
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

const updateFormInstance = async (
  instance: InstanceData,
  validatedContentTtl: string,
) => {
  const deltaQuery = await computeInstanceDeltaQuery(
    instance.formDataTtl,
    validatedContentTtl,
  );

  if (!deltaQuery) return;

  await query(deltaQuery);
};

const addFormInstance = async (instanceContent: string) => {
  await query(ttlToInsert(instanceContent));
};

const deleteFormInstance = async (formTtl: string, instanceUri: string) => {
  const q = await buildFormDeleteQuery(formTtl, instanceUri);
  await query(q);
};

const getFormInstanceCount = async (
  targetType: string,
  labelPredicate: string,
) => {
  const q = `
    PREFIX inst: <http://data.lblod.info/form-data/instances/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    SELECT (COUNT(DISTINCT ?uri) as ?count)
    WHERE {
        ?uri a ${sparqlEscapeUri(targetType)} .
        ?uri ${sparqlEscapeUri(labelPredicate)} ?label .
        ?uri mu:uuid ?id .
    }`;

  const queryResult = await query(q);

  let result = 0;
  queryResult.results.bindings.forEach((binding) => {
    result = parseInt(binding.count.value || '0', 10);
  });

  return result;
};

const getFormInstances = async (
  targetType: string,
  labelPredicate: string,
  options?: { limit?: number; offset?: number },
) => {
  const q = `
    PREFIX inst: <http://data.lblod.info/form-data/instances/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    SELECT DISTINCT ?uri ?label ?id
    WHERE {
        ?uri a ${sparqlEscapeUri(targetType)} .
        ?uri ${sparqlEscapeUri(labelPredicate)} ?label .
        ?uri mu:uuid ?id .
    } ORDER BY ?uri LIMIT ${options?.limit || 20} OFFSET ${options?.offset || 0}
    `;

  const queryResult = await query(q);

  const instance_values: InstanceMinimal[] = [];

  queryResult.results.bindings.map((binding) => {
    const instance = {
      uri: binding.uri.value,
      id: binding.id.value,
      label: binding.label.value,
    };
    instance_values.push(instance);
  });

  return instance_values;
};

const getFormInstancesWithCount = async (
  targetType: string,
  labelPredicate: string,
  options?: { limit?: number; offset?: number },
) => {
  const [instances, count] = await Promise.all([
    getFormInstances(targetType, labelPredicate, options),
    getFormInstanceCount(targetType, labelPredicate),
  ]);

  return { instances, count };
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
  fetchFormInstanceByUri,
  updateFormInstance,
  addFormInstance,
  deleteFormInstance,
  getFormInstancesWithCount,
  fetchInstanceIdByUri,
  fetchInstanceUriById,
};
