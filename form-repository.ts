import { query, sparqlEscapeString, sparqlEscape, sparqlEscapeUri } from 'mu';
import { promises as fs } from 'fs';
import { FormDefinition } from './types';
import { buildFormConstructQuery } from './form-validator';
import { datatypeNames } from './utils';

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

const fetchInstanceUriById = async function (id: string) {
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
