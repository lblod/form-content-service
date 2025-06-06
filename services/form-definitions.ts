import { v4 as uuidv4 } from 'uuid';
import {
  query,
  sparqlEscapeDateTime,
  sparqlEscapeString,
  sparqlEscapeUri,
  update,
} from 'mu';

import { fetchFormDefinitionById } from './forms-from-config';
import { createCustomFormGeneratorTtl } from './custom-forms';
import comunicaRepo from '../domain/data-access/comunica-repository';
import moment from 'moment';
import { defaultFormTypes } from '../controllers/custom-forms';

export async function fetchFormDefinitionIdByUri(formDefinitionUri: string) {
  // As long as the default forms are not in the database we have to check it manually
  // TODO: default forms from the app to the database OR move this to a config in the app
  const defaultForm = defaultFormTypes().find(
    (t) => t.uri === formDefinitionUri,
  );
  if (defaultForm) {
    return defaultForm.id;
  }

  const queryString = `
    PREFIX form: <http://lblod.data.gift/vocabularies/forms/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

    SELECT ?id
    WHERE {
      ${sparqlEscapeUri(formDefinitionUri)} mu:uuid ?id .
      ${sparqlEscapeUri(formDefinitionUri)} form:targetType ?type .
    } LIMIT 1
  `;

  const result = await query(queryString);
  const firstResult = result.results.bindings[0];

  return firstResult?.id?.value;
}

export const fetchFormDefinition = async (id: string) => {
  const formDefinition = await fetchFormDefinitionById(id);

  const { prefix, withHistory } = await comunicaRepo.getFormData(
    formDefinition.formTtl,
  );
  return {
    id,
    uri: formDefinition.uri,
    formTtl: `@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .\n${formDefinition.formTtl}`,
    metaTtl: `@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .\n${formDefinition.metaTtl}`,
    custom: formDefinition.custom,
    prefix,
    withHistory,
  };
};

export async function createEmptyFormDefinition(
  name: string,
  description?: string,
) {
  const safeName = name.replace(/[^a-zA-Z0-9]/g, '');
  const id = uuidv4();
  const formUri = `http://data.lblod.info/id/lmb/forms/${id}`;
  const typeUri = `http://data.lblod.info/id/lmb/form-types/${safeName}-${id}`;
  const groupUri = `http://data.lblod.info/id/lmb/form-groups/${id}`;
  const prefixUri = `http://data.lblod.info/id/lmb/${safeName}-${id}/`;
  const now = moment().toDate();

  let possibleDescription = '';
  if (description) {
    possibleDescription = `${sparqlEscapeUri(
      formUri,
    )} dct:description ${sparqlEscapeString(description)} .`;
  }

  const { generatorUri, generatorTtl } = createCustomFormGeneratorTtl(
    typeUri,
    id,
  );
  const ttlCode = `
    @prefix form: <http://lblod.data.gift/vocabularies/forms/> .
    @prefix sh: <http://www.w3.org/ns/shacl#> .
    @prefix mu: <http://mu.semte.ch/vocabularies/core/> .
    @prefix ext: <http://mu.semte.ch/vocabularies/ext/> .
    @prefix skos: <http://www.w3.org/2004/02/skos/core#> .

    ${sparqlEscapeUri(groupUri)}
      a form:PropertyGroup ;
      sh:name "" ;
      sh:order 1 .

    ${sparqlEscapeUri(formUri)}
      a form:Form, form:TopLevelForm ;
      sh:group ${sparqlEscapeUri(groupUri)} ;
      form:initGenerator ${generatorUri} ;
      form:targetType ${sparqlEscapeUri(typeUri)} ;
      form:targetLabel mu:uuid ;
      ext:prefix ${sparqlEscapeUri(prefixUri)} ;
      ext:isCustomForm """true"""^^xsd:boolean ;
      mu:uuid ${sparqlEscapeString(id)} .
    
    ${generatorTtl}
  `;

  await update(`
    PREFIX form: <http://lblod.data.gift/vocabularies/forms/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
    PREFIX sh: <http://www.w3.org/ns/shacl#>
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

    INSERT DATA {
      ${sparqlEscapeUri(formUri)} a form:Form,
                                    ext:GeneratedForm,
                                    form:TopLevelForm ;
        mu:uuid ${sparqlEscapeString(id)} ;
        skos:prefLabel ${sparqlEscapeString(name)} ;
        ext:isCustomForm """true"""^^xsd:boolean ;
        form:targetLabel mu:uuid ;
        form:targetType ${sparqlEscapeUri(typeUri)} ;
        ext:prefix ${sparqlEscapeUri(prefixUri)} ;
        dct:created ${sparqlEscapeDateTime(now)} ;
        dct:modified ${sparqlEscapeDateTime(now)} ;
        ext:ttlCode ${sparqlEscapeString(ttlCode)} ;
        sh:group ${sparqlEscapeUri(groupUri)} .

        ${sparqlEscapeUri(groupUri)} a form:PropertyGroup ;
        sh:name "" ;
        sh:order 1 .

        ${possibleDescription}
    }
  `);
  return id;
}

export const getFormUsageCount = async (formId: string) => {
  const queryString = `
      PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
      PREFIX form: <http://lblod.data.gift/vocabularies/forms/>
      PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

      SELECT (COUNT(DISTINCT ?usage) AS ?count)
      WHERE {
        ?form mu:uuid ${sparqlEscapeString(formId)}.
        ?form form:targetType ?targetType .

        ?usage a ?targetType .
      }
    `;
  const queryResult = await query(queryString);
  const count = queryResult.results.bindings?.at(0)?.count.value || '0';

  return parseInt(count);
};

export const isFormTypeUsedInCustomFormConfiguration = async (
  formId: string,
) => {
  const queryString = `
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX form: <http://lblod.data.gift/vocabularies/forms/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

    SELECT DISTINCT ?formLabel
    WHERE {
      ?form mu:uuid ${sparqlEscapeString(formId)}.
      ?form form:targetType ?targetType .

      ?field ext:linkedFormType ?form .

      ?usage form:includes ?field .
      OPTIONAL {
        ?usage skos:prefLabel ?usageLabel .
      }.
      OPTIONAL {
        ?usage ext:extendsForm / mu:uuid ?extensionId .
      }

      FILTER (?usage != ?form)
      BIND(IF(BOUND(?usageLabel), ?usageLabel, ?usage) AS ?saveUsageLabel)
      BIND(IF(BOUND(?extensionId), ?extensionId, ?saveUsageLabel) AS ?formLabel)
    }
  `;
  const queryResult = await query(queryString);
  const formUsageLabels = queryResult.results.bindings.map(
    (b) => b.formLabel.value,
  );

  return {
    hasUsage: formUsageLabels.length >= 1,
    formLabels: formUsageLabels,
  };
};

export const removeFormDefinitionUsage = async (formId: string) => {
  await update(`
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX form: <http://lblod.data.gift/vocabularies/forms/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

    DELETE {
      ?instance ?p ?o .
      ?s ?pp ?instance .
    }
    INSERT {
      ?instance a <http://www.w3.org/ns/activitystreams#Tombstone> ;
         <http://www.w3.org/ns/activitystreams#deleted> ?now ;
         <http://www.w3.org/ns/activitystreams#formerType> ?targetType .
    }
    WHERE {
      ?form mu:uuid ${sparqlEscapeString(formId)}.
      ?form form:targetType ?targetType .

      ?instance a ?targetType .
      ?instance ?p ?o .

      OPTIONAL {
        ?s ?pp ?instance .
      }
      BIND(NOW() AS ?now)
    }
  `);
};
