import { app, errorHandler, query } from 'mu';
import Router from 'express-promise-router';
import {
  computeInstanceDeltaQuery,
  fetchFormDefinitionById,
  fetchFormInstanceById,
  loadFormsFromConfig,
} from './form-repository';
import { cleanAndValidateFormInstance } from './form-validator';
import {
  getFormLabel,
  getFormInstances,
  getFormPrefix,
  deleteFormInstance,
} from './queries/formInstances';
import {
  HttpError,
  addTripleToTtl,
  fetchInstanceIdByUri,
  fetchInstanceUriById,
  ttlToInsert,
} from './utils';

const router = Router();

loadFormsFromConfig();

app.use(router);

router.get('/', async function (_req, res) {
  res.send({ status: 'ok' });
});

router.get('/:id', async function (req, res) {
  const form = await fetchFormDefinitionById(req.params.id);
  if (!form) {
    res.send(404);
    return;
  }
  const prefix = await getFormPrefix(form.formTtl);
  res.send({ formTtl: form.formTtl, metaTtl: form.metaTtl, prefix });
});

router.post('/:id', async function (req, res) {
  const form = await fetchFormDefinitionById(req.params.id);
  if (!form) {
    res.send(404);
    return;
  }
  // fetch form content from body
  const { contentTtl, instanceUri } = req.body;

  const validatedContent = await cleanAndValidateFormInstance(
    contentTtl,
    form,
    instanceUri,
  );

  const formLabel = await getFormLabel(form.formTtl);
  if (!formLabel) {
    res.send(500);
    return;
  }
  const predicate = 'http://mu.semte.ch/vocabularies/ext/label';
  const updatedContent = addTripleToTtl(
    validatedContent,
    instanceUri,
    predicate,
    formLabel,
  );

  await query(ttlToInsert(updatedContent));

  const id = await fetchInstanceIdByUri(instanceUri);

  res.send({ id });
});

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

router.get('/:formId/instances', async function (req, res, next) {
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

router.get('/:id/instances/:instanceId', async function (req, res) {
  const { instance } = await fetchInstanceAndForm(
    req.params.id,
    req.params.instanceId,
  );
  res.send(instance);
});

router.put('/:id/instances/:instanceId', async function (req, res) {
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

router.delete('/:id/instances/:instanceId', async function (req, res, next) {
  const instanceUri = await fetchInstanceUriById(req.params.instanceId);
  if (!instanceUri) {
    res.send(404);
    return;
  }

  await deleteFormInstance(instanceUri, next);

  res.send(200);
});

app.use(errorHandler);
