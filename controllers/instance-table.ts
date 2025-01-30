import Router from 'express-promise-router';

import { Request, Response } from 'express';
import { getFormReplacementLabels } from '../services/custom-forms';

export const instanceTableRouter = Router();

instanceTableRouter.get(
  '/:formId/headers',
  async (req: Request, res: Response) => {
    const headerLabels = await getFormReplacementLabels(req.params.formId);
    res.status(200).send({ headers: headerLabels });
  },
);
