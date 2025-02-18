import Router from 'express-promise-router';

import { Request, Response } from 'express';
import { getFormInstanceLabels } from '../services/custom-forms';

export const instanceTableRouter = Router();

instanceTableRouter.get(
  '/:formId/headers',
  async (req: Request, res: Response) => {
    const headerLabels = await getFormInstanceLabels(req.params.formId);
    res.status(200).send({ headers: headerLabels });
  },
);
