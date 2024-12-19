import { Request, Response } from 'express';
import { fetchFormDefinition } from '../services/form-definitions';
import { fetchFormDirectoryNames } from '../services/forms-from-config';
import Router from 'express-promise-router';
import { addField, getFormReplacements } from '../services/custom-forms';

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
    const body = req.body;
    const newFormData = await addField(req.params.id, body);
    res.send(newFormData);
  },
);

// this is in semantic forms territory and there we only know uris... we can solve this with contexts if necessary
formDefinitionRouter.delete('/fields', async (req: Request, res: Response) => {
  const formUri = req.body.formUri;
  const fieldUri = req.body.fieldUri;
  console.log(`deleting field ${formUri} ${fieldUri}`);
  res.send({ success: true });
});

export { formDefinitionRouter };
