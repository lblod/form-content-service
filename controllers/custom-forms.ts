import Router from 'express-promise-router';

import { Request, Response } from 'express';

import {
  fetchCustomFormTypes,
  getFieldsInCustomForm,
  getUsingForms,
} from '../services/custom-forms';

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
