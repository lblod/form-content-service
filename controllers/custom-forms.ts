import Router from 'express-promise-router';

import { Request, Response } from 'express';

import {
  fetchCustomFormTypes,
  getFieldsInCustomForm,
  getUsingForms,
} from '../services/custom-forms';
import { HttpError } from '../domain/http-error';

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
    const uri = req.body?.uri?.trim() ?? null;
    if (!uri) {
      throw new HttpError('No uri was provided.', 400);
    }

    const illegalUris = [
      'http://www.w3.org/1999/02/22-rdf-syntax-ns#Type',
      'http://lblod.data.gift/vocabularies/forms/displayType',
      'http://lblod.data.gift/vocabularies/forms/includes',
      'http://lblod.data.gift/vocabularies/forms/initGenerator',
      'http://lblod.data.gift/vocabularies/forms/validatedBy',
      'http://lblod.data.gift/vocabularies/forms/targetType',
      'http://lblod.data.gift/vocabularies/forms/targetLabel',
      'http://lblod.data.gift/vocabularies/forms/initGenerator',
      'http://lblod.data.gift/vocabularies/forms/prototype',
      'http://lblod.data.gift/vocabularies/forms/dataGenerator',
      'http://lblod.data.gift/vocabularies/forms/shape',
      'http://lblod.data.gift/vocabularies/forms/prefix',
      'http://lblod.data.gift/vocabularies/forms/forType',
      'http://lblod.data.gift/vocabularies/forms/showInSummary',
      'http://www.w3.org/ns/shacl#name',
      'http://www.w3.org/ns/shacl#order',
      'http://www.w3.org/ns/shacl#datatype',
      'http://www.w3.org/ns/shacl#path',
      'http://www.w3.org/ns/shacl#group',
      'http://www.w3.org/ns/shacl#severity',
      'http://www.w3.org/ns/shacl#resultMessage',
      'http://mu.semte.ch/vocabularies/ext/ValueToCompare',
      'http://mu.semte.ch/vocabularies/ext/prefix',
      'http://mu.semte.ch/vocabularies/ext/withHistory',
      'http://mu.semte.ch/vocabularies/core/uuid',
    ];

    const regex = '^(https?://)[a-zA-Z0-9-]+(.[a-zA-Z0-9-]+)*(/.*)?$';
    const uriRegex = new RegExp(regex);
    const isValid = uriRegex.test(uri);
    const hasSpaces = /\s/.test(uri);

    return res.status(200).send({
      isValidUri: isValid && !hasSpaces,
      isAllowed: !illegalUris.includes(uri),
    });
  },
);
