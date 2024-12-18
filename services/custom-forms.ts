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
import { sparqlEscapeObject } from '../helpers/ttl-helpers';

// TODO add a type definition for what we want field descriptions to look like
export async function addField(formId: string, description: any) {
  let form = await fetchFormDefinition(formId);
  let uri = form.uri;
  if (!form.custom) {
    const created = await createCustomExtension(form.uri);
    uri = created.uri;
  }
  await addFieldToFormExtension(uri, form.formTtl, description);
  await updateFormTtlForExtension(uri);
  form = await fetchFormDefinition(formId);
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
        ${sparqlEscapeUri(uri)} a form:Extension;
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
  // find right field group from form ttl
  const fieldGroupUri = `http://data.lblod.info/id/lmb/form-field-groups/${id}`;
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
    }
  `);
  return { id, uri };
}

async function updateFormTtlForExtension(formUri: string) {
  const result = await query(`
  PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
  CONSTRUCT {
    ?s ?p ?o.
  }
  WHERE {
    VALUES ?s {
      ${sparqlEscapeUri(formUri)}
    }
    ?s ?p ?o.
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
      ?s ext:ttlCode ?ttl.
    }
  `);
}
