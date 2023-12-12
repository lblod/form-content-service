import { query, sparqlEscapeString } from 'mu';
import { promises as fs } from 'fs';
import { FormDefinition } from './types';

const formsFromConfig = {};

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
  const formDirectories = await fs.readdir('/config');
  formDirectories.forEach(async (formDirectory) => {
    const form = await loadConfigForm(formDirectory);
    formsFromConfig[formDirectory] = form;
  });
};

export const loadConfigForm = async function (formName: string) {
  const filePath = `/forms/${formName}/form.ttl`;
  const metaPath = `/forms/${formName}/meta.ttl`;
  try {
    const specification = await fs.readFile(filePath, 'utf-8');
    const meta = await fs.readFile(metaPath, 'utf-8').catch(() => null);
    return { formTtl: specification, metaTtl: meta };
  } catch (error) {
    console.error(`Failed to load form ${formName}: ${error}`);
  }
};
