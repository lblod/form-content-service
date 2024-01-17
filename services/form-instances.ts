import {
  computeInstanceDeltaQuery,
  fetchFormDefinitionById,
  fetchFormInstanceById,
} from '../form-repository';
import {
  buildFormDeleteQuery,
  cleanAndValidateFormInstance,
} from '../form-validator';
import { getFormInstances, getFormLabel } from '../queries/formInstances';
import {
  HttpError,
  addTripleToTtl,
  fetchInstanceIdByUri,
  fetchInstanceUriById,
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

export const fetchInstanceAndForm = async function (
  formId: string,
  id: string,
) {
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

export const updateFormInstance = async function (
  formId: string,
  instanceId: string,
  contentTtl: string,
) {
  const { form, instance } = await fetchInstanceAndForm(formId, instanceId);

  const validatedContentTtl = await cleanAndValidateFormInstance(
    contentTtl,
    form,
    instance.instanceUri,
  );

  const deltaQuery = await computeInstanceDeltaQuery(
    instance.formDataTtl,
    validatedContentTtl,
  );

  if (!deltaQuery) {
    return { instance };
  }

  await query(deltaQuery);

  const newInstance = await fetchFormInstanceById(form, instanceId);

  return { newInstance };
};

export const deleteFormInstance = async function (
  formId: string,
  instanceId: string,
) {
  const form = await fetchFormDefinitionById(formId);
  if (!form) {
    throw new HttpError('Form not found', 404);
  }

  const instanceUri = await fetchInstanceUriById(instanceId);
  if (!instanceUri) {
    throw new HttpError('Instance not found', 404);
  }

  // Delete form instance based on form definition.
  const q = await buildFormDeleteQuery(form.formTtl, instanceUri);
  await query(q);

  // TODO at this stage inverse relations are kept intact even if the object gets deleted.
  // Would be better to replace this relation with a tombstone relation.
};
