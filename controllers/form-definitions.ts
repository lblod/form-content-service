import { Request, Response } from 'express';
import { fetchFormDefinition } from '../services/form-definitions';
import { fetchFormDirectories } from '../services/forms-from-config';
import Router from 'express-promise-router';

const formDefinitionRouter = Router();

formDefinitionRouter.get('/forms', async (_req: Request, res: Response) => {
  const formDirectories = await fetchFormDirectories();
  res.send({ formDirectories });
});

formDefinitionRouter.get('/:id', async (req: Request, res: Response) => {
  const definition = await fetchFormDefinition(req.params.id);
  res.send(definition);
});

export { formDefinitionRouter };
