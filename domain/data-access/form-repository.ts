import { query, sparqlEscapeString, sparqlEscapeUri } from 'mu';
import { promises as fs } from 'fs';
import {
  FormDefinition,
  FormsFromConfig,
  InstanceData,
  InstanceMinimal,
} from '../../types';
import {
  buildFormConstructQuery,
  buildFormDeleteQuery,
} from '../../form-validator';
import {
  addTripleToTtl,
  computeIfAbsent,
  quadToString,
  queryStore,
  sparqlEscapeObject,
  ttlToInsert,
  ttlToStore,
} from '../../utils';
import { Quad } from 'n3';

const formsFromConfig: FormsFromConfig = {};
const formDirectory = '/forms';

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

const buildSelectFormOptionsQuery = () =>
  `
  PREFIX form: <http://lblod.data.gift/vocabularies/forms/>

  SELECT ?o
  WHERE {
    ?s form:options ?o
  }
  `;

const formOptionsToConceptSchemeUri = (binding): string => {
  const formOptionsJson: string = binding.get('o').value;
  const { conceptScheme } = JSON.parse(formOptionsJson);
  return conceptScheme;
};

// TODO move to comunica-repository
const fetchConceptSchemeUris = async (formTtl: string): Promise<string[]> => {
  const query = buildSelectFormOptionsQuery();
  const store = await ttlToStore(formTtl);
  const bindings = await queryStore(query, store);

  return bindings.map(formOptionsToConceptSchemeUri);
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

const getConceptSchemesTtl = async (conceptSchemeUris: string[]) => {
  const constructQuery = buildConstructConceptSchemesQuery(conceptSchemeUris);

  const result = await query(constructQuery);

  return result.results.bindings
    .map(
      (binding) =>
        `${sparqlEscapeUri(binding.s.value)} ${sparqlEscapeUri(
          binding.p.value,
        )} ${sparqlEscapeObject(binding.o)} .`,
    )
    .join('\n');
};

// TODO move to service
const fetchMetaTtlBy = async (formTtl: string): Promise<string | null> => {
  const conceptSchemeUris = await fetchConceptSchemeUris(formTtl);
  if (!conceptSchemeUris.length) return null;

  return await getConceptSchemesTtl(conceptSchemeUris);
};

// TODO this method can't be moved to a service, because it needs access to formsFromConfig
export const fetchFormDefinitionById = async (
  formId: string,
): Promise<FormDefinition | null> => {
  const definitionFromConfig: FormDefinition | undefined =
    formsFromConfig[formId];

  const formTtl = await computeIfAbsent(
    definitionFromConfig || {},
    'formTtl',
    () => fetchFormTtlById(formId),
  );

  if (!formTtl) return { formTtl: '' };
  if (!definitionFromConfig) formsFromConfig[formId] = { formTtl };

  const metaTtl = await computeIfAbsent(definitionFromConfig, 'metaTtl', () =>
    fetchMetaTtlBy(formTtl),
  );

  return {
    formTtl,
    metaTtl,
  };
};

export const loadFormsFromConfig = async () => {
  const formDirectories = await fs.readdir(formDirectory);
  formDirectories.forEach(async (formDirectory) => {
    const form = await loadConfigForm(formDirectory);
    formsFromConfig[formDirectory] = form;
  });
};

export const loadConfigForm = async (formName: string) => {
  const filePath = `${formDirectory}/${formName}/form.ttl`;
  const metaPath = `${formDirectory}/${formName}/meta.ttl`;
  try {
    const specification = await fs.readFile(filePath, 'utf-8');
    const meta = await fs.readFile(metaPath, 'utf-8').catch(() => null);
    return { formTtl: specification, metaTtl: meta };
  } catch (error) {
    console.error(`Failed to load form ${formName}: ${error}`);
  }
};

export const fetchFormInstanceById = async (
  form: FormDefinition,
  id: string,
): Promise<InstanceData | null> => {
  const instanceUri = await fetchInstanceUriById(id);
  if (!instanceUri) {
    return null;
  }

  const constructQuery = await buildFormConstructQuery(
    form.formTtl,
    instanceUri,
  );

  const result = await query(constructQuery);

  const ttl = result.results.bindings
    .map((binding) => {
      return `${sparqlEscapeUri(binding.s.value)} ${sparqlEscapeUri(
        binding.p.value,
      )} ${sparqlEscapeObject(binding.o)} .`;
    })
    .join('\n');
  return {
    formDataTtl: `@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .\n${ttl}`,
    instanceUri,
  };
};

export const computeInstanceDeltaQuery = async (
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

export const updateFormInstanceDelta = async (
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

export const addFormInstance = async (
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

export const deleteFormInstanceDb = async (
  formTtl: string,
  instanceUri: string,
) => {
  const q = await buildFormDeleteQuery(formTtl, instanceUri);
  await query(q);
};

export const getFormInstances = async (formLabel: string) => {
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

export const fetchInstanceIdByUri = async (uri: string) => {
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

export const fetchInstanceUriById = async (id: string) => {
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
