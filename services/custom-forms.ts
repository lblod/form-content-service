import { QueryEngine } from '@comunica/query-sparql';
import {
  query,
  sparqlEscapeInt,
  sparqlEscapeString,
  sparqlEscapeUri,
  update,
} from 'mu';
import { v4 as uuidv4 } from 'uuid';
import { sparqlEscapeObject, ttlToStore } from '../helpers/ttl-helpers';
import { fetchFormDefinition } from './form-definitions';
import {
  fetchFormDefinitionById,
  fetchFormDefinitionByUri,
} from './forms-from-config';
import { HttpError } from '../domain/http-error';
import comunicaRepo from '../domain/data-access/comunica-repository';

type FieldDescription =
  | {
      name: string;
      displayType: string;
      libraryEntryUri?: never;
      order?: number;
      path?: string;
      isRequired?: boolean;
    }
  | {
      name: string;
      displayType?: never;
      libraryEntryUri: string;
      order?: number;
      path?: string;
      isRequired?: boolean;
    };
type FieldUpdateDescription = {
  field: string;
  name: string;
  displayType: string;
  isRequired: boolean;
};

const getRequiredConstraintInsertTtl = (fieldUri: string, path?: string) => {
  const uri =
    'http://data.lblod.info/id/lmb/custom-forms/validation/is-required/' +
    uuidv4();
  return `
    ${sparqlEscapeUri(fieldUri)} form:validatedBy ${sparqlEscapeUri(uri)}.

    ${sparqlEscapeUri(uri)} a form:RequiredConstraint ;
      form:grouping form:Bag ;
      sh:resultMessage "Dit veld is verplicht." ;
      sh:path ${path ? sparqlEscapeUri(path) : '?path'} .
  `;
};

export async function addField(formId: string, description: FieldDescription) {
  verifyFieldDescription(description);
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
  await getGeneratorShape(form.formTtl);

  return form;
}

export async function updateField(
  formId: string,
  description: FieldUpdateDescription,
) {
  if (!description.field) {
    throw new HttpError('Field uri must be provided', 400);
  }
  verifyFieldDescription(description);

  const escaped = {
    fieldUri: sparqlEscapeUri(description.field),
    name: sparqlEscapeString(description.name),
    displayType: sparqlEscapeUri(description.displayType),
  };
  let requiredConstraintInsertTtl = '';
  if (description.isRequired) {
    requiredConstraintInsertTtl = getRequiredConstraintInsertTtl(
      description.field,
    );
  }

  await update(`
    PREFIX form: <http://lblod.data.gift/vocabularies/forms/>
    PREFIX sh: <http://www.w3.org/ns/shacl#>

    DELETE {
      ${escaped.fieldUri} sh:name ?fieldName .
      ${escaped.fieldUri} form:displayType ?displayType .

      ${escaped.fieldUri} form:validatedBy ?validation .
        ?validation ?validationP ?validationO .
    }
    INSERT {
      ${escaped.fieldUri} sh:name ${escaped.name} .
      ${escaped.fieldUri} form:displayType ${escaped.displayType} .

      ${description.isRequired ? requiredConstraintInsertTtl : ''}
    }
    WHERE {
      ${escaped.fieldUri} a form:Field ;
        sh:name ?fieldName ;
        form:displayType ?displayType ;
        sh:path ?path .

      OPTIONAL {
        ${escaped.fieldUri} form:validatedBy ?validation .

        ?validation a form:RequiredConstraint ;
          ?validationP ?validationO.
      }
    }
  `);
  const form = await fetchFormDefinition(formId);
  await updateFormTtlForExtension(form.uri);

  return form;
}

export async function moveField(
  formId: string,
  fieldUri: string,
  direction: string,
) {
  const form = await fetchFormDefinition(formId);
  const uri = form.uri;
  if (!form.custom) {
    throw new HttpError('Cannot move fields in a standard form', 400);
  }
  if (!direction) {
    throw new HttpError('Direction must be provided', 400);
  }
  if (!fieldUri) {
    throw new HttpError('Field uri must be provided', 400);
  }
  const fieldsInGroup = await fetchFieldsInGroup(form, fieldUri);
  if (!fieldsInGroup || fieldsInGroup.length === 0) {
    throw new HttpError('Field not found', 400);
  }
  await updateFieldOrder(fieldUri, fieldsInGroup, direction === 'up' ? -1 : 1);
  await updateFormTtlForExtension(uri);
}

async function fetchFieldsInGroup(form, fieldUri) {
  const store = await ttlToStore(form.formTtl);
  const engine = new QueryEngine();

  const query = `
  PREFIX form: <http://lblod.data.gift/vocabularies/forms/>
  PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
  PREFIX sh: <http://www.w3.org/ns/shacl#>

  SELECT ?field ?extends ?order WHERE {
    ${sparqlEscapeUri(fieldUri)} sh:group ?group .
    ?field a form:Field .
    ?field sh:group ?group .
    OPTIONAL { ?field ext:isExtensionField ?extends . }
    ?field sh:order ?order .
  } ORDER BY ?order`;
  const bindingStream = await engine.queryBindings(query, {
    sources: [store],
  });
  const bindings = await bindingStream.toArray();
  return bindings.map((b) => {
    return {
      field: b.get('field').value,
      extends: !!b.get('extends')?.value,
      order: b.get('order').value,
    };
  });
}

async function updateFieldOrder(fieldUri, fieldsInGroup, direction) {
  const newPosition =
    fieldsInGroup.findIndex((f) => f.field === fieldUri) + direction;
  if (newPosition < 0 || newPosition >= fieldsInGroup.length) {
    return;
  }
  const fieldAtOldPosition = fieldsInGroup[newPosition];
  const newFieldOrders = {} as { [key: string]: number };
  if (!fieldAtOldPosition || fieldAtOldPosition.extends) {
    // staying in the same group of extending fields, not jumping over a fixed field
    // find order of fixed field in inverse direction and set order of other fields in the group to be in between
    const newOrder = parseInt(fieldAtOldPosition.order);
    newFieldOrders[fieldUri] = newOrder;
    let currentIndex = newPosition;
    while (fieldsInGroup[currentIndex] && fieldsInGroup[currentIndex].extends) {
      const offset = currentIndex - newPosition;
      if (fieldsInGroup[currentIndex].field !== fieldUri) {
        newFieldOrders[fieldsInGroup[currentIndex].field] =
          newOrder - (offset + 1) * direction;
      }
      currentIndex -= direction;
    }
  } else {
    // jumping over a fixed field. Take the order of this field and set the order of the target to be offset by 1 in the direction, do the same for other extending fields in the group counting in the direction
    newFieldOrders[fieldUri] = parseInt(fieldAtOldPosition.order) + direction;
    let currentIndex = newPosition + direction;
    while (fieldsInGroup[currentIndex] && fieldsInGroup[currentIndex].extends) {
      const offset = currentIndex - newPosition;
      if (fieldsInGroup[currentIndex].field !== fieldUri) {
        newFieldOrders[fieldsInGroup[currentIndex].field] =
          parseInt(fieldAtOldPosition.order) - (offset - 1) * direction;
      }
      currentIndex += direction;
    }
  }

  const updateValues = Object.keys(newFieldOrders).map((fieldUri) => {
    const newOrder = newFieldOrders[fieldUri];
    return `( ${sparqlEscapeUri(fieldUri)} ${sparqlEscapeInt(newOrder)} )`;
  });

  await update(`
    PREFIX sh: <http://www.w3.org/ns/shacl#>

    DELETE {
      ?field sh:order ?oldOrder .
    }
    INSERT {
      ?field sh:order ?newOrder .
    }
    WHERE {
      VALUES (?field ?newOrder) {
        ${updateValues.join(' ')}
      }
      ?field sh:order ?oldOrder .
    }
  `);
}

function verifyFieldDescription(description: FieldDescription) {
  if (!description.name || description.name.trim().length === 0) {
    throw new HttpError('Field description must have a name', 400);
  }
  const noDisplayType =
    !description.displayType || description.displayType.trim().length === 0;
  const noLibraryEntry =
    !description.libraryEntryUri ||
    description.libraryEntryUri.trim().length === 0;
  if (noDisplayType && noLibraryEntry) {
    throw new HttpError(
      'Field description must have a display type or a library entry id',
      400,
    );
  }
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
  fieldDescription: FieldDescription,
) {
  if (fieldDescription.libraryEntryUri) {
    return addLibraryFieldToFormExtension(formUri, formTtl, fieldDescription);
  }

  const nextOrder = await getNextFieldOrder(formUri);

  const id = uuidv4();
  const uri = `http://data.lblod.info/id/lmb/form-fields/${id}`;
  const name = fieldDescription.name;
  const fieldGroupUri = await fetchGroupFromFormTtl(formTtl);
  const safeName = name.replace(/[^a-zA-Z0-9]/g, '');
  const generatedPath = `http://data.lblod.info/id/lmb/form-fields-path/${id}/${safeName}`;
  const path = fieldDescription.path ?? generatedPath;
  const requiredConstraintTtl = fieldDescription.isRequired
    ? getRequiredConstraintInsertTtl(uri, path)
    : '';

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
            sh:order ${nextOrder};
            sh:path ${sparqlEscapeUri(path)};
            mu:uuid ${sparqlEscapeString(id)}.
        ${sparqlEscapeUri(formUri)} form:includes ${sparqlEscapeUri(uri)}.

      ${requiredConstraintTtl}
    }
  `);
  return { id, uri };
}

async function getNextFieldOrder(formUri: string) {
  const result = await query(`
    PREFIX form: <http://lblod.data.gift/vocabularies/forms/>
    PREFIX sh: <http://www.w3.org/ns/shacl#>

    SELECT (MAX(?order) AS ?maxOrder)
    WHERE {
      ${sparqlEscapeUri(formUri)} form:includes ?field .
      ?field sh:order ?order .
    }
  `);
  return parseInt(result.results.bindings[0]?.maxOrder?.value || '9000') + 1;
}

async function addLibraryFieldToFormExtension(
  formUri: string,
  formTtl: string,
  fieldDescription: FieldDescription,
) {
  const id = uuidv4();
  const uri = `http://data.lblod.info/id/lmb/form-fields/${id}`;
  const fieldGroupUri = await fetchGroupFromFormTtl(formTtl);

  const libraryEntryUri = await verifyLibraryEntryUri(
    fieldDescription.libraryEntryUri,
  );
  if (!libraryEntryUri) {
    throw new HttpError('Library entry not found', 404);
  }

  const requiredConstraintTtl = fieldDescription.isRequired
    ? getRequiredConstraintInsertTtl(uri)
    : '';

  const escapedUuid = sparqlEscapeString(id);
  await update(`
    PREFIX form: <http://lblod.data.gift/vocabularies/forms/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX sh: <http://www.w3.org/ns/shacl#>
    PREFIX prov: <http://www.w3.org/ns/prov#>

    INSERT {
        ${sparqlEscapeUri(uri)} a form:Field;
            ext:extendsGroup ${sparqlEscapeUri(fieldGroupUri)} ;
            sh:name ${sparqlEscapeString(fieldDescription.name)} ;
            prov:wasDerivedFrom ${sparqlEscapeUri(libraryEntryUri)} ;
            form:displayType ?displayType ;
            form:validatedBy ?validationUri ;
            sh:order ${sparqlEscapeInt(99999)} ;
            sh:path ?path ;
            mu:uuid ${escapedUuid} .
        ${sparqlEscapeUri(formUri)} form:includes ${sparqlEscapeUri(uri)} .

        ?validationUri ?validationP ?validationO .
        ?validationUri sh:path ?path .

      ${requiredConstraintTtl}        
    } WHERE {
      ${sparqlEscapeUri(libraryEntryUri)} a ext:FormLibraryEntry ;
        sh:path ?path ;
        form:displayType ?displayType .

      OPTIONAL {
        ${sparqlEscapeUri(libraryEntryUri)} form:validatedBy ?validation .
        
        ?validation ?validationP ?validationO .
        FILTER(?validationP != sh:path)
        BIND(URI(CONCAT(?validation, ${escapedUuid})) AS ?validationUri).
      }
    }
  `);
  return { id, uri };
}

async function verifyLibraryEntryUri(libraryEntryUri: string) {
  const result = await query(`
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX sh: <http://www.w3.org/ns/shacl#>
    PREFIX form: <http://lblod.data.gift/vocabularies/forms/>
    SELECT ?libraryEntry
    WHERE {
      VALUES ?libraryEntry {
        ${sparqlEscapeUri(libraryEntryUri)}
      }
      ?libraryEntry a ext:FormLibraryEntry ;
        form:displayType ?type ;
        mu:uuid ?uuid ;
        sh:path ?path .
    }`);
  return result.results.bindings[0]?.libraryEntry?.value;
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
    ?field ext:isExtensionField true.
    ?validation ?vP ?vO.
  }
  WHERE {
    VALUES ?s {
      ${sparqlEscapeUri(formUri)}
    }
    ?s ?p ?o.
    OPTIONAL {
      ?s form:includes ?field.
      ?field ?fieldP ?fieldO.

      OPTIONAL {
        ?field form:validatedBy ?validation.
        ?validation ?vP ?vO.
      }
    }
    FILTER(?p NOT IN (ext:ttlCode))
  }
  `);

  const resultTtl = result.results.bindings
    .map((b) => {
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
      VALUES ?s {
        ${sparqlEscapeUri(formUri)}
      }
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
  const safeReplacement = sparqlEscapeUri(replacementUri);
  const safeStandard = sparqlEscapeUri(standardUri);
  const query = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX form: <http://lblod.data.gift/vocabularies/forms/>

    INSERT DATA {
      ${safeReplacement} ext:replacesForm ${safeStandard} .
      ${safeStandard} a form:Form .
      ${safeStandard} mu:uuid ${sparqlEscapeString(standardId)} .
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
  return result.results.bindings.map((b) => {
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

async function getGeneratorShape(formTtl: string) {
  const store = await ttlToStore(formTtl);
  const engine = new QueryEngine();

  const query = `
  PREFIX form: <http://lblod.data.gift/vocabularies/forms/>
  PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
  PREFIX sh: <http://www.w3.org/ns/shacl#>

  SELECT ?shape WHERE {
    ?generator a form:Generator ;
      form:prototype / form:shape ?shape .
  }`;
  const bindingStream = await engine.queryBindings(query, {
    sources: [store],
  });
  const bindings = await bindingStream.toArray();
  if (!bindings.length) {
    return null;
  }
  const b = bindings[0];
  if (b.get('shape').termType === 'BlankNode') {
    throw new HttpError(
      'Generator shape is a blank node. Cannot extend the form with this field.',
      500,
    );
  }
  return b.get('shape').value;
}

export async function getFormInstanceLabels(formId: string) {
  const baseForm = await fetchFormDefinitionById(formId);
  if (!baseForm) {
    throw new HttpError('base form not found', 404);
  }

  const instanceLabels = await comunicaRepo.getFormLabels(baseForm.formTtl);

  const result = await query(`
    PREFIX form: <http://lblod.data.gift/vocabularies/forms/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX sh: <http://www.w3.org/ns/shacl#>

    SELECT ?field ?fieldName ?fieldValuePath
    WHERE {
      GRAPH ?g {
        ?replacement ext:replacesForm ${sparqlEscapeUri(baseForm.uri)} .
        ?replacement form:includes ?field .

        ?field sh:name ?fieldName .
        ?field sh:path ?fieldValuePath .
      }
    }
  `);

  const customFormLabels = result?.results?.bindings.map((b) => {
    return {
      label: b.fieldName?.value,
      var: b.fieldValuePath?.value,
      uri: b.field?.value,
    };
  });

  return [...instanceLabels, ...customFormLabels];
}
