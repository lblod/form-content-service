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
import { InstanceMinimal, Label } from '../types';
import {
  fieldTypesUris,
  formatFieldValueAsDate,
  getAddressValue,
} from '../utils/get-custom-form-field-value';
import { createDisplayTypeConstraintsTtlForFieldPath } from './display-type-validations';

type FieldDescription =
  | {
      name: string;
      displayType: string;
      libraryEntryUri?: never;
      order?: number;
      path?: string;
      isRequired?: boolean;
      showInSummary?: boolean;
      conceptScheme?: string;
      linkedFormTypeUri?: string;
    }
  | {
      name: string;
      displayType: string;
      libraryEntryUri: string;
      order?: number;
      path?: string;
      isRequired?: boolean;
      showInSummary?: boolean;
      conceptScheme?: string;
      linkedFormTypeUri?: string;
    };
type FieldUpdateDescription = {
  field: string;
  name: string;
  displayType: string;
  path?: string;
  isRequired: boolean;
  showInSummary?: boolean;
  conceptScheme?: string;
  linkedFormTypeUri: string;
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

async function updateFieldPath(
  formId: string,
  fieldUri: string,
  pathUri?: string,
) {
  if (!pathUri) {
    return;
  }
  const newPath = sparqlEscapeUri(pathUri);

  const currentPath = (
    await query(`
    PREFIX form: <http://lblod.data.gift/vocabularies/forms/>
    PREFIX sh: <http://www.w3.org/ns/shacl#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

    SELECT ?path
    WHERE {
      ?form mu:uuid ${sparqlEscapeString(formId)} .
      ?form form:includes ?field .
      ${sparqlEscapeUri(fieldUri)} sh:path ?path .
    } LIMIT 1
  `)
  ).results.bindings[0]?.path?.value;

  if (currentPath !== pathUri) {
    await query(`
    PREFIX form: <http://lblod.data.gift/vocabularies/forms/>
    PREFIX sh: <http://www.w3.org/ns/shacl#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

    DELETE {
      ?field sh:path ?path .
      ?validation sh:path ?validationPath .
      ?instance ?path ?fieldValue .
    }
    INSERT {
      ?field sh:path ${newPath} .
      ?validation sh:path ${newPath} .
      ?instance ${newPath} ?fieldValue .
    }
    WHERE {
      VALUES ?field { ${sparqlEscapeUri(fieldUri)} }
      ?field sh:path ?path .
      OPTIONAL {
        ?field form:validatedBy ?validation .
        ?validation sh:path ?validationPath .
      }
      ?form mu:uuid ${sparqlEscapeString(formId)} .
      ?form form:includes ?field .
      ?form form:targetType ?target .
      OPTIONAL {
        ?instance a ?target .
        ?instance ?path ?fieldValue .
      }
    }
  `);
  }
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
  let showInSummaryTtl = '';
  if (description.isRequired) {
    requiredConstraintInsertTtl = getRequiredConstraintInsertTtl(
      description.field,
    );
  }
  if (description.showInSummary) {
    showInSummaryTtl = `
      ${escaped.fieldUri} form:showInSummary true .
    `;
  }

  let conceptSchemeInsertTtl = '';
  if (isConceptSchemeRequiredField(description.displayType)) {
    const conceptSchemeUri = sparqlEscapeUri(description.conceptScheme);
    conceptSchemeInsertTtl = `
    ${escaped.fieldUri} fieldOption:conceptScheme ${conceptSchemeUri} .`;
  }
  let linkedFormTypeTtl = '';
  if (description.linkedFormTypeUri) {
    const linkedFormTypeUri = sparqlEscapeUri(description.linkedFormTypeUri);
    linkedFormTypeTtl = `${escaped.fieldUri} ext:linkedFormType ${linkedFormTypeUri} .`;
  }

  await update(`
    PREFIX form: <http://lblod.data.gift/vocabularies/forms/>
    PREFIX sh: <http://www.w3.org/ns/shacl#>
    PREFIX fieldOption: <http://lblod.data.gift/vocabularies/form-field-options/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

    DELETE {
      ${escaped.fieldUri} sh:name ?fieldName .

      ${escaped.fieldUri} form:validatedBy ?validation .
        ?validation ?validationP ?validationO .
      ${escaped.fieldUri} form:showInSummary ?summary .
      ${escaped.fieldUri} fieldOption:conceptScheme ?conceptScheme .
      ${escaped.fieldUri} ext:linkedFormType ?linkedFormType .
    }
    INSERT {
      ${escaped.fieldUri} sh:name ${escaped.name} .

      ${requiredConstraintInsertTtl}
      ${showInSummaryTtl}
      ${conceptSchemeInsertTtl}
      ${linkedFormTypeTtl}
    }
    WHERE {
      ${escaped.fieldUri} a form:Field ;
        sh:path ?path ;
        sh:name ?fieldName .

      OPTIONAL {
        ${escaped.fieldUri} form:showInSummary ?summary .
      }

      OPTIONAL {
        ${escaped.fieldUri} form:validatedBy ?validation .

        ?validation a form:RequiredConstraint ;
          ?validationP ?validationO.
      }
      OPTIONAL {
        ${escaped.fieldUri} fieldOption:conceptScheme ?conceptScheme .
      }
      OPTIONAL {
        ${escaped.fieldUri} ext:linkedFormType ?linkedFormType .
      }
    }
  `);
  await updateFieldPath(formId, description.field, description.path);
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
  const bindingStream = await engine.queryBindings(query, { sources: [store] });
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

const isConceptSchemeRequiredField = (displayType: string) => {
  const displayTypes = [
    'http://lblod.data.gift/display-types/lmb/custom-concept-scheme-selector-input',
    'http://lblod.data.gift/display-types/lmb/custom-concept-scheme-multi-selector-input',
  ];

  return displayTypes.includes(displayType);
};

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

  if (
    isConceptSchemeRequiredField(description.displayType) &&
    !description.conceptScheme
  ) {
    throw new HttpError(
      `Field description must have a conceptScheme. This is required for field type "${description.displayType}"`,
      400,
    );
  }
  if (
    description.displayType ===
      'http://lblod.data.gift/display-types/lmb/custom-link-to-form-selector-input' &&
    !description.linkedFormTypeUri
  ) {
    throw new HttpError(
      `Field description must have a linkedFormTypeUri. This is required for field type "${description.displayType}"`,
      400,
    );
  }
}

async function createCustomExtension(
  formUri: string,
): Promise<{ id: string; uri: string }> {
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
  const showInSummaryTtl = fieldDescription.showInSummary
    ? `${sparqlEscapeUri(uri)} form:showInSummary true .`
    : '';
  let conceptSchemeTtl = '';
  if (isConceptSchemeRequiredField(fieldDescription.displayType)) {
    const conceptSchemeUri = sparqlEscapeUri(fieldDescription.conceptScheme);
    conceptSchemeTtl = `
      ${sparqlEscapeUri(uri)} fieldOption:conceptScheme ${conceptSchemeUri} .`;
  }
  let linkedFormTypeTtl = '';
  if (fieldDescription.linkedFormTypeUri) {
    const linkedFormTypeUri = sparqlEscapeUri(
      fieldDescription.linkedFormTypeUri,
    );
    linkedFormTypeTtl = `${sparqlEscapeUri(
      uri,
    )} ext:linkedFormType ${linkedFormTypeUri} .`;
  }

  let displayTypeConstraintTtl = '';
  const displayTypeConstraints =
    await createDisplayTypeConstraintsTtlForFieldPath(
      path,
      fieldDescription.displayType,
    );

  if (displayTypeConstraints.hasValidations) {
    const addToField = displayTypeConstraints.validationUris.map(
      (validation) =>
        `${sparqlEscapeUri(uri)}
          form:validatedBy ${sparqlEscapeUri(validation)} .`,
    );
    displayTypeConstraintTtl = `
      ${addToField}
      ${displayTypeConstraints.ttl}
    `;
  }
  let pathTtl = '';
  if (path !== generatedPath) {
    pathTtl = `
    ${sparqlEscapeUri(uri)} ext:hasUserInputPath """true"""^^xsd:boolean .`;
  }

  await update(`
    PREFIX form: <http://lblod.data.gift/vocabularies/forms/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX sh: <http://www.w3.org/ns/shacl#>
    PREFIX fieldOption: <http://lblod.data.gift/vocabularies/form-field-options/>

    INSERT DATA {
        ${sparqlEscapeUri(uri)} a form:Field;
            sh:group ${sparqlEscapeUri(fieldGroupUri)} ;
            ext:extendsGroup ${sparqlEscapeUri(fieldGroupUri)};
            sh:name ${sparqlEscapeString(name)};
            form:displayType ${sparqlEscapeUri(fieldDescription.displayType)};
            sh:order ${nextOrder};
            sh:path ${sparqlEscapeUri(path)};
            mu:uuid ${sparqlEscapeString(id)}.
        ${sparqlEscapeUri(formUri)} form:includes ${sparqlEscapeUri(uri)}.

      ${requiredConstraintTtl}
      ${showInSummaryTtl}
      ${conceptSchemeTtl}
      ${linkedFormTypeTtl}
      ${displayTypeConstraintTtl}
      ${pathTtl}
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
            ext:isLibraryEntryField """true"""^^xsd:boolean ;
            sh:group ${sparqlEscapeUri(fieldGroupUri)} ;
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

  const bindingStream = await engine.queryBindings(query, { sources: [store] });
  const bindings = await bindingStream.toArray();
  return bindings?.[0]?.get('group')?.value;
}

async function updateFormTtlForExtension(formUri: string) {
  const result = await query(`
  PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
  PREFIX form: <http://lblod.data.gift/vocabularies/forms/>
  PREFIX sh: <http://www.w3.org/ns/shacl#>

  CONSTRUCT {
    ?s ?p ?o.
    ?field ?fieldP ?fieldO.
    ?field ext:isExtensionField true.
    ?validation ?vP ?vO.

    ?group ?gp ?go .
  }
  WHERE {
    VALUES ?s {
      ${sparqlEscapeUri(formUri)}
    }
    ?s ?p ?o.

    OPTIONAL {
      ?s sh:group ?group .
      ?group ?gp ?go .
    }


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

  let resultTtl = result.results.bindings
    .map((b) => {
      return `${sparqlEscapeUri(b.s.value)} ${sparqlEscapeUri(
        b.p.value,
      )} ${sparqlEscapeObject(b.o)} .`;
    })
    .join('\n');

  const targetTypeQueryResult = await query(`
    PREFIX form: <http://lblod.data.gift/vocabularies/forms/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

    SELECT ?targetType ?formId
    WHERE {
      ${sparqlEscapeUri(formUri)} form:targetType ?targetType .
      ${sparqlEscapeUri(formUri)} mu:uuid ?formId .
    }
  `);

  const targetType =
    targetTypeQueryResult.results.bindings?.at(0)?.targetType?.value;
  const formId = targetTypeQueryResult.results.bindings?.at(0)?.formId?.value;

  if (targetType) {
    const { generatorUri, generatorTtl } = createCustomFormGeneratorTtl(
      targetType,
      formId,
    );
    resultTtl = `
      @prefix form: <http://lblod.data.gift/vocabularies/forms/> .
      @prefix ext: <http://mu.semte.ch/vocabularies/ext/> .
      @prefix mu: <http://mu.semte.ch/vocabularies/core/> .

      ${resultTtl}

      ${sparqlEscapeUri(formUri)} form:initGenerator ${generatorUri} .
      ${generatorTtl}
    `;
  }

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

export function createCustomFormGeneratorTtl(formType: string, formId: string) {
  const uris = {
    shape: sparqlEscapeUri(
      `http://mu.semte.ch/vocabularies/ext/customFormS-${formId}`,
    ),
    prototype: sparqlEscapeUri(
      `http://mu.semte.ch/vocabularies/ext/customFormP-${formId}`,
    ),
    generator: sparqlEscapeUri(
      `http://mu.semte.ch/vocabularies/ext/customFormG-${formId}`,
    ),
  };
  const ttl = `
    ${uris.shape} a ${sparqlEscapeUri(formType)},
                              ext:CustomFormType .

    ${uris.prototype} a ext:FormPrototype .
    ${uris.prototype} form:shape ${uris.shape} .

    ${uris.generator} a form:Generator .
    ${uris.generator} form:prototype ${uris.prototype} .
    ${uris.generator} form:dataGenerator form:addMuUuid .
  `;

  return {
    generatorUri: uris.generator,
    generatorTtl: ttl,
  };
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
      ${sparqlEscapeUri(formUri)} ext:isCustomForm true .
      ${sparqlEscapeUri(formUri)} form:includes ${sparqlEscapeUri(fieldUri)} .
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
  const bindingStream = await engine.queryBindings(query, { sources: [store] });
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

export async function getFormInstanceLabels(
  formId: string,
): Promise<Array<Label>> {
  const baseForm = await fetchFormDefinitionById(formId);
  if (!baseForm) {
    throw new HttpError('base form not found', 404);
  }

  const instanceLabels = await comunicaRepo.getFormLabels(baseForm.formTtl);

  let fieldsSource = `
    ?replacement ext:replacesForm ${sparqlEscapeUri(baseForm.uri)} .
    ?replacement form:includes ?field .
  `;
  if (baseForm.custom) {
    fieldsSource = `
    ${sparqlEscapeUri(baseForm.uri)} a ext:GeneratedForm .
    ${sparqlEscapeUri(baseForm.uri)} form:includes ?field .
  `;
  }

  const result = await query(`
    PREFIX form: <http://lblod.data.gift/vocabularies/forms/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX sh: <http://www.w3.org/ns/shacl#>

    SELECT ?field ?fieldName ?fieldValuePath ?displayType ?showInSummary ?order
    WHERE {
      GRAPH ?g {
        ${fieldsSource}

        ?field sh:name ?fieldName .
        ?field sh:path ?fieldValuePath .
        ?field form:displayType ?displayType .

        OPTIONAL {
          ?field sh:order ?order .
        }
        OPTIONAL {
          ?field form:showInSummary ?showInSummary .
        }
      }
    }
    ORDER BY ?fieldName
  `);

  const customFormLabels = result?.results?.bindings.map((b) => {
    return {
      name: b.fieldName?.value,
      var: b.fieldName?.value.replace(/\W/g, '')?.toLowerCase(),
      uri: b.fieldValuePath?.value,
      type: b.displayType?.value,
      isShownInSummary: !!b.showInSummary?.value,
      isCustom: true,
      order: b.order?.value ? parseInt(b.order.value) : null,
    };
  });

  let order = 2;
  const labelsWithOrder = [...instanceLabels, ...customFormLabels]
    .map((label) => {
      if (label.order) {
        return label;
      }

      return { ...label, order: order++ };
    })
    .sort((a, b) => a.order - b.order);
  return [
    { name: 'Uri', var: 'uri', uri: null, order: 0 },
    {
      name: 'Id',
      var: 'id',
      uri: 'http://mu.semte.ch/vocabularies/core/uuid',
      order: 1,
    },
    ...labelsWithOrder,
  ];
}

export async function enhanceDownloadedInstancesWithComplexPaths(
  instances: Array<InstanceMinimal>,
  complexPathInstances: Array<{
    instance: InstanceMinimal;
    labels: Array<Label>;
  }>,
): Promise<Array<InstanceMinimal>> {
  const enhancedInstances = [...instances];
  await Promise.all(
    complexPathInstances.map(async (value) => {
      const { instance, labels } = value;
      for (let index = 0; index < labels.length; index++) {
        const label = labels[index];
        const matchIndex = enhancedInstances.findIndex(
          (i) => i.uri === instance.uri,
        );
        if (matchIndex == -1) {
          return;
        }
        const latestInstance = enhancedInstances[matchIndex];
        const complexValue = await getValueForCustomField(
          label.type,
          latestInstance[label.name],
        );
        enhancedInstances[matchIndex] = {
          ...latestInstance,
          [label.name]: complexValue,
        };
      }
    }),
  );

  return enhancedInstances;
}

export async function getValueForCustomField(
  fieldType?: string,
  fieldValue?: string,
) {
  if (!fieldValue || !fieldValue) {
    return null;
  }

  const formatMap = {
    [fieldTypesUris.date]: () => formatFieldValueAsDate(fieldValue),
    [fieldTypesUris.address]: async () => await getAddressValue(fieldValue),
  };

  if (Object.keys(formatMap).includes(fieldType)) {
    return formatMap[fieldType]();
  }

  return fieldValue;
}

export async function fetchCustomFormTypes() {
  const queryString = `
    PREFIX form: <http://lblod.data.gift/vocabularies/forms/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

    SELECT DISTINCT ?form ?formName
    WHERE {
      ?form a ext:GeneratedForm .
      ?form form:targetType ?type .
      ?form skos:prefLabel ?formName .

      FILTER NOT EXISTS {
        ?form ext:extendsForm ?baseForm .
      }
    }
    GROUP BY ?form ?type ?formName
    ORDER BY ?type
    `;
  let results = [];
  try {
    const queryResults = await query(queryString);
    results = queryResults.results.bindings || [];
  } catch (error) {
    throw new HttpError(
      'Something went wrong while fetching custom form types',
      500,
    );
  }
  return results.map((b) => {
    return {
      uri: b.form.value,
      label: b.formName.value,
    };
  });
}

export async function getFieldsInCustomForm(formId: string) {
  const form = await fetchFormDefinition(formId);
  if (!form.custom) {
    throw new HttpError('Cannot get custom fields in a standard form', 400);
  }
  const store = await ttlToStore(form.formTtl);
  const engine = new QueryEngine();
  const query = `
    PREFIX form: <http://lblod.data.gift/vocabularies/forms/>
    PREFIX sh: <http://www.w3.org/ns/shacl#>
    PREFIX fieldOption: <http://lblod.data.gift/vocabularies/form-field-options/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

    SELECT DISTINCT ?field ?displayType ?path ?label ?order ?isRequired ?isShownInSummary ?isLibraryField ?conceptScheme ?linkedFormType ?isUserInputPath
    WHERE {
      ?field a form:Field .
      ?field sh:path ?path .
      ?field sh:name ?label .
      ?field form:displayType ?displayType .

      OPTIONAL {
        ?field sh:order ?order .
      }
      OPTIONAL {
        ?field form:validatedBy ?requiredValidation.
        ?requiredValidation a form:RequiredConstraint .
      }
      OPTIONAL {
        ?field form:showInSummary ?showInSummary .
      }
      OPTIONAL {
        ?field ext:isLibraryEntryField ?isLibraryEntryField .
      }
      OPTIONAL {
        ?field ext:hasUserInputPath ?hasUserInputPath .
      }
      OPTIONAL {
        ?field fieldOption:conceptScheme ?conceptScheme .
      }
      OPTIONAL {
        ?field ext:linkedFormType ?linkedFormType .
      }
      BIND(IF(BOUND(?requiredValidation), true, false) AS ?isRequired)
      BIND(IF(BOUND(?showInSummary), true, false) AS ?isShownInSummary)
      BIND(IF(BOUND(?isLibraryEntryField), true, false) AS ?isLibraryField)
      BIND(IF(BOUND(?hasUserInputPath), true, false) AS ?isUserInputPath)
    }
    ORDER BY ?order
  `;
  const bindingStream = await engine.queryBindings(query, { sources: [store] });
  const bindings = await bindingStream.toArray();
  return bindings.map((b) => {
    const isLibraryEntryField = stringToBoolean(b.get('isLibraryField').value);
    const isUserInputPath = stringToBoolean(b.get('isUserInputPath').value);
    return {
      formUri: form.uri,
      uri: b.get('field').value,
      label: b.get('label').value,
      path:
        isLibraryEntryField || !isUserInputPath ? null : b.get('path').value,
      displayType: b.get('displayType').value,
      order: parseInt(b.get('order').value || '0'),
      conceptScheme: b.get('conceptScheme')?.value,
      linkedFormTypeUri: b.get('linkedFormType')?.value,
      isRequired: stringToBoolean(b.get('isRequired')?.value),
      isShownInSummary: stringToBoolean(b.get('isShownInSummary')?.value),
    };
  });
}

function stringToBoolean(valueAsString?: string) {
  const mapping = {
    '1': true,
    '0': false,
    true: true,
    false: false,
  };

  if (!Object.keys(mapping).includes(valueAsString)) {
    return false;
  }

  return mapping[valueAsString];
}

export async function getUsingForms(instanceUri: string) {
  const findUsersQuery = `
    PREFIX form: <http://lblod.data.gift/vocabularies/forms/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX sh: <http://www.w3.org/ns/shacl#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

    SELECT DISTINCT ?formUri ?formId ?formLabel ?userInstanceUri ?userInstanceId ?instanceType WHERE {
      ?userInstanceUri ?linkingPredicate ${sparqlEscapeUri(instanceUri)} .
      ?userInstanceUri mu:uuid ?userInstanceId .
      ?g ext:ownedBy ?someone.
      ?field sh:path ?linkingPredicate.
      ?formUri form:includes ?field .
      ?formUri a ext:GeneratedForm .
      ?formUri mu:uuid ?formId .
      ?userInstanceUri a ?instanceType.
      FILTER(?instanceType != <http://mu.semte.ch/vocabularies/ext/CustomFormType>)
      OPTIONAL {
        ?formUri skos:prefLabel ?formLabel .
      }
    }
  `;
  const result = await query(findUsersQuery);
  const bindings = result.results.bindings || [];
  return bindings.map((b) => {
    return {
      formUri: b.formUri.value,
      formId: b.formId.value,
      instanceUri: b.userInstanceUri.value,
      instanceId: b.userInstanceId.value,
      instanceType: b.instanceType.value,
      formLabel: b.formLabel?.value, // in the case of extending existing forms, the label is sometimes not present
    };
  });
}

export async function isUriUsedAsPredicateInForm(
  formId: string,
  pathUri: string,
  fieldUri: string,
) {
  let fieldFilter = '';
  if (fieldUri) {
    fieldFilter = `FILTER(?field != ${sparqlEscapeUri(fieldUri)})`;
  }

  const result = await query(`
    PREFIX form: <http://lblod.data.gift/vocabularies/forms/>
    PREFIX sh: <http://www.w3.org/ns/shacl#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

    SELECT DISTINCT ?field
    WHERE {
      ?form mu:uuid ${sparqlEscapeString(formId)} .
      ?form form:includes ?field .
      ?field sh:path ${sparqlEscapeUri(pathUri)} .

      ${fieldFilter}
    } LIMIT 1
  `);

  return result.results.bindings.length > 0;
}

export async function hasFormInstanceWithValueForPredicate(
  formId: string,
  pathUri: string,
) {
  const formDefinition = await fetchFormDefinitionById(formId);
  if (!formDefinition) {
    throw new Error('Unknown form');
  }
  const formType = await comunicaRepo.getFormType(formDefinition.formTtl);

  const result = await query(`
    PREFIX form: <http://lblod.data.gift/vocabularies/forms/>
    PREFIX sh: <http://www.w3.org/ns/shacl#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

    SELECT DISTINCT ?form
    WHERE {
      ?instance a ${sparqlEscapeUri(formType)}.
      ?instance ${sparqlEscapeUri(pathUri)} ?o .
    } LIMIT 1
  `);

  return result.results.bindings.length > 0;
}
