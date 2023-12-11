import { app, errorHandler, query } from 'mu';
import {
  fetchFormDefinitionById,
  loadFormsFromConfig,
} from './form-repository';
import { cleanAndValidateFormTtl } from './form-validator';
import { ttlToInsert } from './utils';
// @ts-ignore unused but needed for linting to work
import bodyParser from 'body-parser';

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
  const { contentTtl } = req.body;

  const validatedContent = await cleanAndValidateFormTtl(contentTtl, form);

  query(ttlToInsert(validatedContent));

  res.send(form);
});

app.use(errorHandler);
