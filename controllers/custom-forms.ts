import Router from 'express-promise-router';

import { Request, Response } from 'express';

import { fetchCustomFormTypes } from '../services/custom-forms';

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

async function fetchDefaultFormTypes() {
  return [
    {
      id: 'bestuurseenheid-contact',
      prefix: 'http://data.lblod.info/id/BestuurseenheidContact/',
      label: 'Bestuurseenheid Contact',
    },
    {
      id: 'bestuursorgaan',
      prefix: 'http://data.lblod.info/id/bestuursorganen/',
      label: 'Bestuursorgaan',
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
    {
      id: 'persoon',
      prefix: 'http://data.lblod.info/id/personen/',
      label: 'Persoon',
    },
  ].sort((a, b) => a.label.localeCompare(b.label));
}
