import express from 'express';
import { fetchFormDefinitionById } from '../form-repository';
import { getFormLabel, getFormPrefix } from '../queries/formInstances';
import { cleanAndValidateFormInstance } from '../form-validator';
import { addTripleToTtl, fetchInstanceIdByUri, ttlToInsert } from '../utils';
import { query } from 'mu';

const formDefinitionRouter = express.Router();

formDefinitionRouter.get('/:id', async function (req, res) {
  const form = await fetchFormDefinitionById(req.params.id);
  if (!form) {
    res.send(404);
    return;
  }
  const prefix = await getFormPrefix(form.formTtl);
  res.send({ formTtl: form.formTtl, metaTtl: form.metaTtl, prefix });
});

formDefinitionRouter.post('/:id', async function (req, res) {
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

export { formDefinitionRouter };
