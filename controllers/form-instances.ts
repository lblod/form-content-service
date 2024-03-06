import { Request, Response } from 'express';
import Router from 'express-promise-router';
import {
  deleteFormInstance,
  fetchInstanceAndForm,
  getInstancesForForm,
  postFormInstance,
  updateFormInstance,
} from '../services/form-instances';

const formInstanceRouter = Router();

// should this be a post to /:id/instances?
formInstanceRouter.post('/:id', async (req: Request, res: Response) => {
  const id = await postFormInstance(req.params.id, req.body);
  res.send({ id });
});

formInstanceRouter.get(
  '/:formId/instances',
  async (req: Request, res: Response) => {
    const limit = parseInt(req.query.page?.size || 0, 10);
    const offset = parseInt(req.query.page?.number || 0, 10) * limit;
    const formInstances = await getInstancesForForm(req.params.formId, {
      limit,
      offset,
    });
    res.set('X-Total-Count', formInstances.count);
    res.send({ instances: formInstances.instances });
  },
);

formInstanceRouter.get(
  '/:id/instances/:instanceId',
  async (req: Request, res: Response) => {
    const { instance } = await fetchInstanceAndForm(
      req.params.id,
      req.params.instanceId,
    );
    res.send(instance);
  },
);

formInstanceRouter.put(
  '/:id/instances/:instanceId',
  async (req: Request, res: Response) => {
    const { instance } = await updateFormInstance(
      req.params.id,
      req.params.instanceId,
      req.body.contentTtl,
    );
    res.send({ instance });
  },
);

formInstanceRouter.delete(
  '/:id/instances/:instanceId',
  async (req: Request, res: Response) => {
    deleteFormInstance(req.params.id, req.params.instanceId);
    res.send(200);
  },
);

export { formInstanceRouter };
