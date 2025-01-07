import { Request, Response } from 'express';
import { fetchFormDefinition } from '../services/form-definitions';
import { fetchFormDirectoryNames } from '../services/forms-from-config';
import Router from 'express-promise-router';
import {
  addField,
  deleteFormField,
  getFormReplacements,
} from '../services/custom-forms';

const formDefinitionRouter = Router();

formDefinitionRouter.get('/forms', async (_req: Request, res: Response) => {
  const formDirectories = await fetchFormDirectoryNames();
  res.send({ formDirectories });
});

formDefinitionRouter.get(
  '/form-replacements',
  async (_req: Request, res: Response) => {
    const replacements = await getFormReplacements();
    res.send({ replacements });
  },
);

formDefinitionRouter.get('/:id', async (req: Request, res: Response) => {
  const definition = await fetchFormDefinition(req.params.id);
  res.send(definition);
});

formDefinitionRouter.post(
  '/:id/fields',
  async (req: Request, res: Response) => {
    const newFormData = await addField(req.params.id, req.body);
    res.send(newFormData);
  },
);

// this is in semantic forms territory and there we only know uris... we can solve this with contexts if necessary
formDefinitionRouter.delete('/fields', async (req: Request, res: Response) => {
  const newFormData = await deleteFormField(
    req.body.formUri,
    req.body.fieldUri,
  );
  res.send(newFormData);
});

export { formDefinitionRouter };
