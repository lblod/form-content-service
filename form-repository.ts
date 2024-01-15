import { query, sparqlEscapeString, sparqlEscape, sparqlEscapeUri } from 'mu';
import { promises as fs } from 'fs';
import { FormDefinition } from './types';
import { buildFormConstructQuery } from './form-validator';
import {
  datatypeNames,
  fetchInstanceUriById,
  quadToString,
  queryStore,
  ttlToStore,
} from './utils';
import { Quad } from 'n3';

const formsFromConfig = {};
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

const sparqlEscapeObject = (bindingObject): string => {
  const escapeType = datatypeNames[bindingObject.datatype] || 'string';
  return bindingObject.type === 'uri'
    ? sparqlEscapeUri(bindingObject.value)
    : sparqlEscape(bindingObject.value, escapeType);
};

const fetchMetaTtlBy = async (formTtl: string): Promise<string | null> => {
  const conceptSchemeUris = await fetchConceptSchemeUris(formTtl);
  if (!conceptSchemeUris.length) return null;
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

// Mutates object argument
export const computeIfAbsent = async <Key, Value>(
  object,
  key: Key,
  mappingFunction: (key: Key) => Promise<Value>,
): Promise<Value | null> => {
  const value: Value | undefined = object[key];
  if (value) return value;

  const newValue = await mappingFunction(key);
  if (newValue) {
    object[key] = newValue;
    return newValue;
  }

  return null;
};

export const fetchFormDefinitionById = async function (
  formId: string,
): Promise<FormDefinition | null> {
  const definitionFromConfig: FormDefinition | undefined =
    formsFromConfig[formId];

  const formTtl = await computeIfAbsent(
    definitionFromConfig || {},
    'formTtl',
    (k) => fetchFormTtlById(formId),
  );

  if (!formTtl) return { formTtl: '' };
  if (!definitionFromConfig) formsFromConfig[formId] = { formTtl };

  const metaTtl = await computeIfAbsent(definitionFromConfig, 'metaTtl', (k) =>
    fetchMetaTtlBy(formTtl),
  );

  return {
    formTtl,
    metaTtl,
  };
};

export const loadFormsFromConfig = async function () {
  const formDirectories = await fs.readdir(formDirectory);
  formDirectories.forEach(async (formDirectory) => {
    const form = await loadConfigForm(formDirectory);
    formsFromConfig[formDirectory] = form;
  });
};

export const loadConfigForm = async function (formName: string) {
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

export const fetchFormInstanceById = async function (
  form: FormDefinition,
  id: string,
) {
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
      let object;
      if (binding.o.type === 'uri') {
        object = sparqlEscapeUri(binding.o.value);
      } else {
        object = sparqlEscape(
          binding.o.value,
          datatypeNames[binding.o.datatype] || 'string',
        );
      }
      return `${sparqlEscapeUri(binding.s.value)} ${sparqlEscapeUri(
        binding.p.value,
      )} ${object} .`;
    })
    .join('\n');
  return {
    formDataTtl: `@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .\n${ttl}`,
    instanceUri,
  };
};

export const computeInstanceDeltaQuery = async function (
  oldInstanceTtl: string,
  newInstanceTtl: string,
) {
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
