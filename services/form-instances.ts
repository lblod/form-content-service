import { fetchFormDefinitionById } from '../form-repository';
import { cleanAndValidateFormInstance } from '../form-validator';
import { getFormInstances, getFormLabel } from '../queries/formInstances';
import {
  HttpError,
  addTripleToTtl,
  fetchInstanceIdByUri,
  ttlToInsert,
} from '../utils';
import { query } from 'mu';

export const postFormInstance = async function (
  formId: string,
  body: { contentTtl: string; instanceUri: string },
) {
  const form = await fetchFormDefinitionById(formId);
  if (!form) {
    throw new HttpError('Form not found', 404);
  }
  // fetch form content from body
  const { contentTtl, instanceUri } = body;

  const validatedContent = await cleanAndValidateFormInstance(
    contentTtl,
    form,
    instanceUri,
  );

  const formLabel = await getFormLabel(form.formTtl);
  if (!formLabel) {
    throw new HttpError(
      'Form not specified correctly, form label missing',
      500,
    );
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

  return id;
};

export const getInstancesForForm = async function (formId: string) {
  const form = await fetchFormDefinitionById(formId);
  if (!form) {
    throw new HttpError('Form not found', 404);
  }

  const formLabel = await getFormLabel(form.formTtl);
  if (!formLabel) {
    throw new HttpError(
      'Form not specified correctly, form label missing',
      500,
    );
  }

  return await getFormInstances(formLabel);
};
