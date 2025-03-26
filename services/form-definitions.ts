import { v4 as uuidv4 } from 'uuid';
import {
  sparqlEscapeDateTime,
  sparqlEscapeString,
  sparqlEscapeUri,
  update,
} from 'mu';

import { fetchFormDefinitionById } from './forms-from-config';
import comunicaRepo from '../domain/data-access/comunica-repository';
import moment = require('moment');

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

  const ttlCode = `
    @prefix form: <http://lblod.data.gift/vocabularies/forms/> .
    @prefix sh: <http://www.w3.org/ns/shacl#> .
    @prefix mu: <http://mu.semte.ch/vocabularies/core/> .
    @prefix ext: <http://mu.semte.ch/vocabularies/ext/> .
    @prefix skos: <http://www.w3.org/2004/02/skos/core#> .

    ext:hiddenFormNameF a form:Field ;
      sh:name ${sparqlEscapeString(name)} ;
      sh:order 5000 ;
      sh:path skos:prefLabel .

      ${sparqlEscapeUri(groupUri)}
        a form:PropertyGroup ;
        sh:name "" ;
        sh:order 1 .

    <http://data.lblod.info/id/lmb/forms/custom-form>
      a form:Form, form:TopLevelForm ;
      sh:group ${sparqlEscapeUri(groupUri)} ;
      form:includes ext:hiddenFormNameF ;
      form:initGenerator ext:customFormG ;
      form:targetType ${sparqlEscapeUri(typeUri)} ;
      form:targetLabel skos:prefLabel ;
      ext:prefix ${sparqlEscapeUri(prefixUri)} ;
      mu:uuid ${sparqlEscapeString(id)} .

    ext:customFormG a form:Generator ;
      form:prototype [
        form:shape [
          a ${sparqlEscapeUri(typeUri)}
        ]
      ];
      form:dataGenerator form:addMuUuid .
  `;

  await update(`
    PREFIX form: <http://lblod.data.gift/vocabularies/forms/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
    PREFIX sh: <http://www.w3.org/ns/shacl#>

    INSERT DATA {
      ${sparqlEscapeUri(formUri)} a form:Form,
                                    ext:GeneratedForm,
                                    form:TopLevelForm ;
        mu:uuid ${sparqlEscapeString(id)} ;
        ext:isCustomForm """true"""^^xsd:boolean ;
        form:targetLabel ${sparqlEscapeString(name)} ;
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
