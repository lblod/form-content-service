import { Request, Response } from 'express';
import { fetchFormDefinition } from '../services/form-definitions';
import { fetchFormDirectoryNames } from '../services/forms-from-config';
import Router from 'express-promise-router';

const formDefinitionRouter = Router();

formDefinitionRouter.get('/forms', async (_req: Request, res: Response) => {
  const formDirectories = await fetchFormDirectoryNames();
  res.send({ formDirectories });
});

formDefinitionRouter.get('/:id', async (req: Request, res: Response) => {
  const definition = await fetchFormDefinition(req.params.id);
  res.send(definition);
});

export { formDefinitionRouter };
