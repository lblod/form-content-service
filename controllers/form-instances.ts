import { Request, Response } from 'express';
import Router from 'express-promise-router';
import {
  createHistoryForInstance,
  deleteFormInstance,
  fetchInstanceAndForm,
  getHistoryForInstance,
  getHistoryInstance,
  getInstancesForForm,
  getInstancesForFormByUris,
  getInstanceUsageCount,
  postFormInstance,
  updateFormInstance,
} from '../services/form-instances';
import { HttpError } from '../domain/http-error';
import { fetchFormDefinitionIdByUri } from '../services/form-definitions';
import { getFormInstanceLabels } from '../services/custom-forms';

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
    const sort = req.query.sort;
    const filter = req.query.filter;
    const labels = JSON.parse(decodeURIComponent(req.query.labels)) ?? [];
    const formInstances = await getInstancesForForm(req.params.formId, {
      limit,
      offset,
      sort,
      filter,
      labels,
    });
    res.set('X-Total-Count', formInstances.count);
    res.send({
      instances: formInstances.instances,
      labels: formInstances.labels,
    });
  },
);

formInstanceRouter.post(
  '/instances/by-form-definition-uri',
  async (req: Request, res: Response) => {
    if (!req.body.formDefinitionUri) {
      throw new HttpError('No formDefinitionUri was provided.', 400);
    }

    const instanceUris = req.body.instanceUris || [];
    const limit =
      instanceUris.length || parseInt(req.query.page?.size || 10, 10);
    const offset = parseInt(req.query.page?.number || 0, 10) * limit;
    const sort = req.query.sort;
    const filter = req.query.filter;

    const formDefinitionId = await fetchFormDefinitionIdByUri(
      req.body.formDefinitionUri,
    );
    if (!formDefinitionId) {
      throw new HttpError(
        `No id for formDefinition uri: ${req.body.formDefinitionUri}`,
        404,
      );
    }
    const labels = await getFormInstanceLabels(formDefinitionId);
    const formInstances = await getInstancesForFormByUris(formDefinitionId, {
      offset,
      sort,
      filter,
      labels: labels.filter((l) => l.isShownInSummary),
      instanceUris,
    });

    res.set('X-Total-Count', formInstances.count);
    res.send({
      instances: formInstances.instances,
      labels: formInstances.labels,
    });
  },
);

formInstanceRouter.post(
  '/:formId/get-instances-by-uri',
   async (req: Request, res: Response) => {
    const labels = req.body.labels ?? [];
    const instanceUris = req.body.uris ?? [];

    if (instanceUris.length === 0) {
      res.set('X-Total-Count', 0);
      res.send({
        instances: [],
        labels: labels,
      });
      return;
    }
    const formInstances = await getInstancesForFormByUris(
      req.params.formId,
      {
        instanceUris,
        labels,
      }
    );
    res.set('X-Total-Count', formInstances.count);
    res.send({
      instances: formInstances.instances,
    });
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

formInstanceRouter.get(
  '/instance/:id/usage-count',
  async (req: Request, res: Response) => {
    const usageCount = await getInstanceUsageCount(req.params.id);

    res.status(200).send({
      hasUsage: usageCount >= 1,
      count: usageCount,
    });
  },
);

export { formInstanceRouter };
