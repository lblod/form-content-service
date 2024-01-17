import express from 'express';
import {
  computeInstanceDeltaQuery,
  fetchFormDefinitionById,
  fetchFormInstanceById,
} from '../form-repository';
import { query } from 'mu';
import { HttpError, executeQuery, fetchInstanceUriById } from '../utils';
import { getFormInstances, getFormLabel } from '../queries/formInstances';
import {
  buildFormDeleteQuery,
  cleanAndValidateFormInstance,
} from '../form-validator';

const formInstanceRouter = express.Router();

const fetchInstanceAndForm = async function (formId: string, id: string) {
  const form = await fetchFormDefinitionById(formId);
  if (!form) {
    throw new HttpError('Form not found', 404);
  }
  const instance = await fetchFormInstanceById(form, id);

  if (!instance) {
    throw new HttpError('Instance not found', 404);
  }
  return { form, instance };
};

formInstanceRouter.get('/:formId/instances', async function (req, res, next) {
  const form = await fetchFormDefinitionById(req.params.formId);
  if (!form) {
    res.send(404);
    return;
  }

  const formLabel = await getFormLabel(form.formTtl);
  if (!formLabel) {
    res.send(500);
    return;
  }

  const formInstances = await getFormInstances(formLabel, next);

  res.send(formInstances);
});

formInstanceRouter.get('/:id/instances/:instanceId', async function (req, res) {
  const { instance } = await fetchInstanceAndForm(
    req.params.id,
    req.params.instanceId,
  );
  res.send(instance);
});

formInstanceRouter.put('/:id/instances/:instanceId', async function (req, res) {
  const instanceId = req.params.instanceId;
  const { form, instance } = await fetchInstanceAndForm(
    req.params.id,
    instanceId,
  );

  const validatedContentTtl = await cleanAndValidateFormInstance(
    req.body.contentTtl,
    form,
    instance.instanceUri,
  );

  const deltaQuery = await computeInstanceDeltaQuery(
    instance.formDataTtl,
    validatedContentTtl,
  );

  if (!deltaQuery) {
    res.send({ instance });
    return;
  }

  await query(deltaQuery);

  const newInstance = await fetchFormInstanceById(form, instanceId);

  res.send({ instance: newInstance });
});

formInstanceRouter.delete(
  '/:id/instances/:instanceId',
  async function (req, res, next) {
    const form = await fetchFormDefinitionById(req.params.id);
    if (!form) {
      res.send(404);
      return;
    }

    const instanceUri = await fetchInstanceUriById(req.params.instanceId);
    if (!instanceUri) {
      res.send(404);
      return;
    }

    // Delete form instance based on form definition.
    const query = await buildFormDeleteQuery(form.formTtl, instanceUri);
    await executeQuery(query, next);

    // TODO at this stage inverse relations are kept intact even if the object gets deleted.
    // Would be better to replace this relation with a tombstone relation.

    res.send(200);
  },
);

export { formInstanceRouter };
