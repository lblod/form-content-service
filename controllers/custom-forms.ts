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
      id: 'bestuurseenheid-contact',
      prefix: 'http://data.lblod.info/id/BestuurseenheidContact/',
      label: 'Bestuurseenheid Contact',
    },
    {
      id: 'contactinfo',
      prefix: 'http://data.lblod.info/id/contact-punten/',
      label: 'Contact Info',
    },
    {
      id: 'fractie',
      prefix: 'http://data.lblod.info/id/fracties/',
      label: 'Fractie',
    },
    {
      id: 'mandaat',
      prefix: 'http://data.lblod.info/id/mandaten/',
      label: 'Mandaat',
    },
    {
      id: 'mandataris-edit',
      prefix: 'http://data.lblod.info/id/mandatarissen/',
      label: 'Mandataris',
    },
  ].sort((a, b) => a.label.localeCompare(b.label));
}
