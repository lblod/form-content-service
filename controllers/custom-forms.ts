import Router from 'express-promise-router';
import { Request, Response } from 'express';

import { fetchFormDirectoryNames } from '../services/forms-from-config';
import { fetchCustomFormTypes } from '../services/custom-forms';

export const customFormRouter = Router();

customFormRouter.get('/form-types', async (req: Request, res: Response) => {
  const defaultTypeIds = await fetchFormDirectoryNames();
  const customTypes = await fetchCustomFormTypes();

  return res.status(200).send({
    defaultTypes: defaultTypeIds.map((id) => {
      return {
        typeId: id,
        label: id,
      };
    }),
    customTypes,
  });
});
customFormRouter.get('/:form-type-id/forms', async (req: Request, res: Response) => { });
customFormRouter.get('/:formId/summary-fields', async (req: Request, res: Response) => { });
