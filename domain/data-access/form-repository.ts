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

  return { instances: instance_values };
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
  getFormInstances,
  fetchInstanceIdByUri,
  fetchInstanceUriById,
};
