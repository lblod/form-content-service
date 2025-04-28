import Router from 'express-promise-router';

import { Request, Response } from 'express';

import {
  fetchCustomFormTypes,
  getFieldsInCustomForm,
} from '../services/custom-forms';

export const customFormRouter = Router();

customFormRouter.get(
  '/form-type-options',
  async (req: Request, res: Response) => {
    const defaultTypes = await fetchDefaultFormTypes();
    const customTypes = await fetchCustomFormTypes();

    return res.status(200).send({
      defaultTypes,
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

async function fetchDefaultFormTypes() {
  return [
    {
      label: 'Mandataris',
      uri: 'http://data.vlaanderen.be/ns/mandaat#Mandataris',
    },
    {
      label: 'Mandaat',
      uri: 'http://data.vlaanderen.be/ns/mandaat#Mandaat',
    },
    {
      label: 'Fractie',
      uri: 'http://data.vlaanderen.be/ns/mandaat#Fractie',
    },
    {
      label: 'Bestuurseenheid-contact',
      uri: 'http://mu.semte.ch/vocabularies/ext/BestuurseenheidContact',
    },
  ].sort((a, b) => a.label.localeCompare(b.label));
}
