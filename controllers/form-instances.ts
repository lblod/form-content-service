import { Request, Response } from 'express';
import Router from 'express-promise-router';
import {
  createHistoryForInstance,
  deleteFormInstance,
  fetchInstanceAndForm,
  getHistoryForInstance,
  getHistoryInstance,
  getInstancesForForm,
  postFormInstance,
  updateFormInstance,
} from '../services/form-instances';

const formInstanceRouter = Router();
const getSessionId = (req: Request) => req.get('mu-session-id');

// should this be a post to /:id/instances?
formInstanceRouter.post('/:id', async (req: Request, res: Response) => {
  const id = await postFormInstance(req.params.id, req.body, getSessionId(req));
  res.send({ id });
});

formInstanceRouter.get(
  '/:formId/instances',
  async (req: Request, res: Response) => {
    const limit = parseInt(req.query.page?.size || 10, 10);
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

formInstanceRouter.get(
  '/:id/instances/:instanceId/history',
  async (req: Request, res: Response) => {
    const limit = parseInt(req.query.page?.size || 10, 10);
    const offset = parseInt(req.query.page?.number || 0, 10) * limit;
    const history = await getHistoryForInstance(req.params.instanceId, {
      limit,
      offset,
    });
    res.set('X-Total-Count', history.count);
    res.send({ instances: history.instances });
  },
);

/**
 * Creates a new history entry for the given instance and form, with an optional description.
 */
formInstanceRouter.post(
  '/:id/instances/:instanceId/history',
  async (req: Request, res: Response) => {
    const { description } = req.body;

    const instanceTtl = await createHistoryForInstance(
      req.params.id,
      req.params.instanceId,
      getSessionId(req),
      description,
    );
    res.send({ instanceTtl });
  },
);

formInstanceRouter.get('/history', async (req: Request, res: Response) => {
  const historyUri = req.query.historyUri;
  const instanceTtl = await getHistoryInstance(historyUri);

  res.set('Content-Type', 'text/turtle');
  res.send(instanceTtl);
});

formInstanceRouter.put(
  '/:id/instances/:instanceId',
  async (req: Request, res: Response) => {
    const { instance } = await updateFormInstance(
      req.params.id,
      req.params.instanceId,
      req.body.contentTtl,
      getSessionId(req),
      req.body.description,
    );
    res.send({ instance });
  },
);

formInstanceRouter.delete(
  '/:id/instances/:instanceId',
  async (req: Request, res: Response) => {
    await deleteFormInstance(req.params.id, req.params.instanceId);
    res.sendStatus(200);
  },
);

export { formInstanceRouter };
