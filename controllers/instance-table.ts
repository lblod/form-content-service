import Router from 'express-promise-router';

import { Request, Response } from 'express';
import { getFormInstanceLabels } from '../services/custom-forms';
import { instancesAsCsv } from '../services/form-instances';

export const instanceTableRouter = Router();

instanceTableRouter.get(
  '/:formId/headers',
  async (req: Request, res: Response) => {
    const headerLabels = await getFormInstanceLabels(req.params.formId);
    res.status(200).send({ headers: headerLabels });
  },
);
instanceTableRouter.get(
  '/:formId/download',
  async (req: Request, res: Response) => {
    const labels = JSON.parse(decodeURIComponent(req.query.labels)) ?? [];
    const csvString = await instancesAsCsv(req.params.formId, labels);

    res.set('Content-Type', 'text/csv');
    res.set('Content-Disposition', 'attachment; filename="instances.csv"');
    return res.status(200).send(csvString);
  },
);
