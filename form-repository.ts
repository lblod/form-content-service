import { query, sparqlEscapeString, sparqlEscape, sparqlEscapeUri } from 'mu';
import { promises as fs } from 'fs';
import { FormDefinition } from './types';
import { buildFormConstructQuery } from './form-validator';
import {
  datatypeNames,
  fetchInstanceUriById,
  quadToString,
  ttlToStore,
} from './utils';
import { Quad } from 'n3';

const formsFromConfig = {};
const formDirectory = '/forms';

export const fetchFormDefinitionById = async function (
  id: string,
): Promise<FormDefinition | null> {
  if (formsFromConfig[id]) {
    return formsFromConfig[id];
  }

  const result = await query(`
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX sh: <http://www.w3.org/ns/shacl#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

    SELECT ?formDefinition ?formTtl
    WHERE {
      ?formDefinition a ext:GeneratedForm ;
        mu:uuid ${sparqlEscapeString(id)} ;
        ext:ttlCode ?formTtl .
    } LIMIT 1
  `);

  if (result.results.bindings.length) {
    const binding = result.results.bindings[0];
    return {
      formTtl: binding.formTtl.value,
    };
  } else {
    return null;
  }
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
