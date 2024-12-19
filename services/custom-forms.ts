import { FormDefinition } from '../types';
import { fetchFormDefinition } from './form-definitions';
import { v4 as uuidv4 } from 'uuid';
import {
  query,
  update,
  sparqlEscapeUri,
  sparqlEscapeString,
  sparqlEscapeInt,
} from 'mu';
import { sparqlEscapeObject, ttlToStore } from '../helpers/ttl-helpers';
import { QueryEngine } from '@comunica/query-sparql';
import { fetchFormDefinitionByUri } from './forms-from-config';

export async function addField(formId: string, description: any) {
  let form = await fetchFormDefinition(formId);
  let uri = form.uri;
  let modifiedFormId = formId;
  if (!form.custom) {
    const created = await createCustomExtension(form.uri);
    modifiedFormId = created.id;
    await markReplacement(form.id, form.uri, created.uri);
    uri = created.uri;
  }
  await addFieldToFormExtension(uri, form.formTtl, description);
  await updateFormTtlForExtension(uri);
  form = await fetchFormDefinition(modifiedFormId);
  return form;
}

async function createCustomExtension(formUri: string): Promise<{
  id: string;
  uri: string;
}> {
  const id = uuidv4();
  const uri = `http://data.lblod.info/id/lmb/forms/${id}`;

  await update(`
    PREFIX form: <http://lblod.data.gift/vocabularies/forms/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

    INSERT DATA {
        ${sparqlEscapeUri(uri)} a form:Extension, ext:GeneratedForm;
            ext:extendsForm ${sparqlEscapeUri(formUri)};
            ext:isCustomForm true;
            mu:uuid ${sparqlEscapeString(id)}.
    }
  `);
  return { id, uri };
}

async function addFieldToFormExtension(
  formUri: string,
  formTtl: string,
  fieldDescription: any,
) {
  const id = uuidv4();
  const uri = `http://data.lblod.info/id/lmb/form-fields/${id}`;
  const name = fieldDescription.name;
  const fieldGroupUri = await fetchGroupFromFormTtl(formTtl);
  const safeName = name.replace(/[^a-zA-Z0-9]/g, '');
  const generatedPath = `http://data.lblod.info/id/lmb/form-fields-path/${id}/${safeName}`;

  await update(`
    PREFIX form: <http://lblod.data.gift/vocabularies/forms/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX sh: <http://www.w3.org/ns/shacl#>

    INSERT DATA {
        ${sparqlEscapeUri(uri)} a form:Field;
            ext:extendsGroup ${sparqlEscapeUri(fieldGroupUri)};
            sh:name ${sparqlEscapeString(name)};
            form:displayType ${sparqlEscapeUri(fieldDescription.displayType)};
            sh:order ${sparqlEscapeInt(fieldDescription.order)};
            sh:path ${sparqlEscapeUri(fieldDescription.path || generatedPath)};
            mu:uuid ${sparqlEscapeString(id)}.
        ${sparqlEscapeUri(formUri)} form:includes ${sparqlEscapeUri(uri)}.
    }
  `);
  return { id, uri };
}

async function fetchGroupFromFormTtl(formTtl: string) {
  const store = await ttlToStore(formTtl);
  const engine = new QueryEngine();
  const query = `
    PREFIX form: <http://lblod.data.gift/vocabularies/forms/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX sh: <http://www.w3.org/ns/shacl#>

    SELECT ?group
    WHERE {
      VALUES ?type {
        form:FieldGroup
        form:PropertyGroup
      }
      ?group a ?type.
    } LIMIT 1
  `;

  const bindingStream = await engine.queryBindings(query, {
    sources: [store],
  });
  const bindings = await bindingStream.toArray();
  return bindings?.[0]?.get('group')?.value;
}

async function updateFormTtlForExtension(formUri: string) {
  const result = await query(`
  PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
  PREFIX form: <http://lblod.data.gift/vocabularies/forms/>
  CONSTRUCT {
    ?s ?p ?o.
    ?field ?fieldP ?fieldO.
  }
  WHERE {
    VALUES ?s {
      ${sparqlEscapeUri(formUri)}
    }
    ?s ?p ?o.
    OPTIONAL {
      ?s form:includes ?field.
      ?field ?fieldP ?fieldO.
    }
    FILTER(?p NOT IN (ext:ttlCode))
  }
  `);

  const resultTtl = result.results.bindings
    .map((b: any) => {
      return `${sparqlEscapeUri(b.s.value)} ${sparqlEscapeUri(
        b.p.value,
      )} ${sparqlEscapeObject(b.o)} .`;
    })
    .join('\n');
  await update(`
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

    DELETE {
      ?s ext:ttlCode ?ttl.
    }
    INSERT {
      ?s ext:ttlCode ${sparqlEscapeString(resultTtl)}.
    }
    WHERE {
      ?s ext:isCustomForm true.
      OPTIONAL {
        ?s ext:ttlCode ?ttl.
      }
    }
  `);
}

async function markReplacement(
  standardId: string,
  standardUri: string,
  replacementUri: string,
) {
  const query = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX form: <http://lblod.data.gift/vocabularies/forms/>

    INSERT DATA {
      ${sparqlEscapeUri(replacementUri)} ext:replacesForm ${sparqlEscapeUri(
        standardUri,
      )} .
      ${sparqlEscapeUri(standardUri)} a form:Form .
      ${sparqlEscapeUri(standardUri)} mu:uuid ${sparqlEscapeString(
        standardId,
      )} .
    }`;

  await update(query);
}

export async function getFormReplacements() {
  const q = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

    SELECT ?standard ?replacement ?standardId ?replacementId
    WHERE {
      ?replacement ext:replacesForm ?standard .
      ?standard mu:uuid ?standardId .
      ?replacement mu:uuid ?replacementId .
    }`;

  const result = await query(q);
  return result.results.bindings.map((b: any) => {
    return {
      standard: b.standard.value,
      replacement: b.replacement.value,
      standardId: b.standardId.value,
      replacementId: b.replacementId.value,
    };
  });
}

export async function deleteFormField(formUri: string, fieldUri: string) {
  await deleteFieldFromFormExtension(formUri, fieldUri);
  await updateFormTtlForExtension(formUri);
  const newFormData = await fetchFormDefinitionByUri(formUri);
  return newFormData;
}

async function deleteFieldFromFormExtension(formUri: string, fieldUri: string) {
  await update(`
    PREFIX form: <http://lblod.data.gift/vocabularies/forms/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

    DELETE {
        ${sparqlEscapeUri(formUri)} form:includes ${sparqlEscapeUri(fieldUri)}.
        ${sparqlEscapeUri(fieldUri)} ?p ?o.
    }
    WHERE {
        ${sparqlEscapeUri(formUri)} a form:Extension;
          ext:isCustomForm true;
          form:includes ${sparqlEscapeUri(fieldUri)}.
        ${sparqlEscapeUri(fieldUri)} ?p ?o.
    }
  `);
}
