import express, { Request, Response } from 'express';
import {
  deleteFormInstance,
  fetchInstanceAndForm,
  getInstancesForForm,
  postFormInstance,
  updateFormInstance,
} from '../services/form-instances';

const formInstanceRouter = express.Router();

// should this be a post to /:id/instances?
formInstanceRouter.post('/:id', async (req: Request, res: Response) => {
  const id = await postFormInstance(req.params.id, req.body);
  res.send({ id });
});

formInstanceRouter.get(
  '/:formId/instances',
  async (req: Request, res: Response) => {
    const formInstances = await getInstancesForForm(req.params.formId);
    res.send(formInstances);
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
