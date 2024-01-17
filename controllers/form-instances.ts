import express from 'express';
import {
  deleteFormInstance,
  fetchInstanceAndForm,
  getInstancesForForm,
  postFormInstance,
  updateFormInstance,
} from '../services/form-instances';

const formInstanceRouter = express.Router();

// should this be a post to /:id/instances?
formInstanceRouter.post('/:id', async function (req, res) {
  const id = await postFormInstance(req.params.id, req.body);
  res.send({ id });
});

formInstanceRouter.get('/:formId/instances', async function (req, res, next) {
  const formInstances = await getInstancesForForm(req.params.formId);
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
  const { instance } = await updateFormInstance(
    req.params.id,
    req.params.instanceId,
    req.body.contentTtl,
  );
  res.send({ instance: instance });
});

formInstanceRouter.delete(
  '/:id/instances/:instanceId',
  async function (req, res) {
    deleteFormInstance(req.params.id, req.params.instanceId);
    res.send(200);
  },
);

export { formInstanceRouter };
