import Router from 'express-promise-router';
import { Request, Response } from 'express';

import {
  createEmptyFormDefinition,
  fetchFormDefinition,
} from '../services/form-definitions';
import { fetchFormDirectoryNames } from '../services/forms-from-config';
import {
  addField,
  deleteFormField,
  getFormReplacements,
  moveField,
  updateField,
} from '../services/custom-forms';
import { HttpError } from '../domain/http-error';

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
formDefinitionRouter.put('/:id/fields', async (req: Request, res: Response) => {
  const updatedFormData = await updateField(req.params.id, req.body);
  res.send(updatedFormData);
});

formDefinitionRouter.post(
  '/:id/fields/move',
  async (req: Request, res: Response) => {
    const newFormData = await moveField(
      req.params.id,
      req.body.fieldUri,
      req.body.direction,
    );
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

formDefinitionRouter.post(
  '/definition/new',
  async (req: Request, res: Response) => {
    if (!req.body.name) {
      throw new HttpError('No name was provided.', 400);
    }

    const id = await createEmptyFormDefinition(req.body.name);
    res.status(201).send({ id });
  },
);

export { formDefinitionRouter };
