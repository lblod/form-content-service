import Router from 'express-promise-router';

import { Request, Response } from 'express';

import {
  fetchCustomFormTypes,
  getFieldsInCustomForm,
  getUsingForms,
  isUriUsedAsPredicateInForm,
} from '../services/custom-forms';
import { HttpError } from '../domain/http-error';
import { DCTERMS, EXT, FORM, LMB, MANDAAT, MU, RDF, SHACL } from '../utils/uri';

export const customFormRouter = Router();

customFormRouter.get(
  '/form-type-options',
  async (req: Request, res: Response) => {
    const customTypes = await fetchCustomFormTypes();

    return res.status(200).send({
      defaultTypes: defaultFormTypes(),
      customTypes,
    });
  },
);

customFormRouter.get('/:id/fields', async (req: Request, res: Response) => {
  const fields = await getFieldsInCustomForm(req.params.id);

  return res.status(200).send({
    fields,
  });
});

export function defaultFormTypes() {
  return [
    {
      label: 'Mandataris',
      uri: 'http://data.vlaanderen.be/ns/mandaat#Mandataris',
      id: 'mandataris-edit',
    },
    {
      label: 'Mandaat',
      uri: 'http://data.vlaanderen.be/ns/mandaat#Mandaat',
      id: 'mandaat',
    },
    {
      label: 'Fractie',
      uri: 'http://data.vlaanderen.be/ns/mandaat#Fractie',
      id: 'fractie',
    },
    {
      label: 'Bestuurseenheid-contact',
      uri: 'http://mu.semte.ch/vocabularies/ext/BestuurseenheidContact',
      id: 'bestuurseenheid-contact',
    },
  ].sort((a, b) => a.label.localeCompare(b.label));
}

customFormRouter.get('/find-usage', async (req: Request, res: Response) => {
  const instanceUri = req.query.instanceUri.toString();

  const users = await getUsingForms(instanceUri);
  return res.status(200).send({
    users,
  });
});

customFormRouter.post(
  '/field/is-uri-allowed-as-path',
  async (req: Request, res: Response) => {
    const uri = req.body?.uri ?? null;
    if (!uri) {
      throw new HttpError('No uri was provided.', 400);
    }

    const regex = '^(https?://)[a-zA-Z0-9-]+(.[a-zA-Z0-9-]+)*(/.*)?$';
    const uriRegex = new RegExp(regex);
    const isUri = uriRegex.test(uri);
    const hasSpaces = /\s/.test(uri);
    const isValid = isUri && !hasSpaces;

    const illegalUris = [
      RDF('type'),
      MU('uuid'),
      DCTERMS('modified'),
      DCTERMS('isVersionOf'),
      FORM('displayType'),
      FORM('includes'),
      FORM('initGenerator'),
      FORM('validatedBy'),
      FORM('targetType'),
      FORM('targetLabel'),
      FORM('initGenerator'),
      FORM('prototype'),
      FORM('dataGenerator'),
      FORM('shape'),
      FORM('prefix'),
      FORM('forType'),
      FORM('showInSummary'),
      SHACL('name'),
      SHACL('order'),
      SHACL('datatype'),
      SHACL('path'),
      SHACL('group'),
      SHACL('severity'),
      SHACL('resultMessage'),
      EXT('ValueToCompare'),
      EXT('prefix'),
      EXT('withHistory'),
      EXT('isLibraryEntryField'),
      EXT('hasUserInputPath'),
      LMB('hasPublicationStatus'),
      MANDAAT('bekrachtigtAanstellingVan'),
    ];
    const isAllowed = !illegalUris.includes(uri);

    const formId = req.body?.formId ?? null;
    const fieldUri = req.body?.fieldUri ?? null;
    let isUniquePathInForm = true;
    if (formId && isValid) {
      isUniquePathInForm = await isUriUsedAsPredicateInForm(
        formId,
        uri,
        fieldUri,
      );
    }

    const errorMessageMapping = [
      {
        message: 'Deze URI wordt al gebruikt in het formulier',
        isActive: isValid && !isUniquePathInForm,
      },
      {
        message: 'Deze URI is niet toegestaan',
        isActive: isValid && !isAllowed,
      },
      {
        message: 'Geef een geldige URI',
        isActive: !isValid,
      },
    ];
    const errorMessageMatch = errorMessageMapping.find(
      (option) => option.isActive,
    );

    return res.status(200).send({
      isValid: isValid && isUniquePathInForm && isAllowed,
      errorMessage: errorMessageMatch?.message,
    });
  },
);
