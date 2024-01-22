import { Request, Response } from 'express';
import { fetchFormDefinition } from '../services/form-definitions';
import Router from 'express-promise-router';

const formDefinitionRouter = Router();

formDefinitionRouter.get('/:id', async (req: Request, res: Response) => {
  const { formTtl, metaTtl, prefix } = await fetchFormDefinition(req.params.id);
  res.send({ formTtl, metaTtl, prefix });
});

export { formDefinitionRouter };
