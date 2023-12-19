import { app, errorHandler, query } from 'mu';
import {
  fetchFormDefinitionById,
  fetchFormInstanceById,
  loadFormsFromConfig,
} from './form-repository';
import { cleanAndValidateFormInstance } from './form-validator';
import { fetchInstanceIdByUri, ttlToInsert } from './utils';

loadFormsFromConfig();

app.get('/', async function (_req, res) {
  res.send({ status: 'ok' });
});

app.get('/:id', async function (_req, res) {
  const form = await fetchFormDefinitionById(_req.params.id);
  if (!form) {
    res.send(404);
    return;
  }
  res.send(form);
});

app.post('/:id', async function (req, res) {
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

  query(ttlToInsert(validatedContent));

  const id = await fetchInstanceIdByUri(instanceUri);

  res.send({ id });
});

app.get('/:id/instances/:instanceId', async function (req, res) {
  const form = await fetchFormDefinitionById(req.params.id);
  if (!form) {
    res.send(404);
    return;
  }
  const instance = await fetchFormInstanceById(form, req.params.instanceId);

  if (!instance) {
    res.send(404);
    return;
  }

  res.send(instance);
});

app.use(errorHandler);
