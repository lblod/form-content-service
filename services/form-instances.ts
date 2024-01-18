import { getFormLabel } from '../domain/data-access/comunica-repository';
import {
  addFormInstance,
  deleteFormInstanceDb,
  fetchFormDefinitionById,
  fetchFormInstanceById,
  fetchInstanceIdByUri,
  fetchInstanceUriById,
  getFormInstances,
  updateFormInstanceDelta,
} from '../domain/data-access/form-repository';
import { HttpError } from '../domain/http-error';
import { cleanAndValidateFormInstance } from '../form-validator';
import { InstanceInput } from '../types';

export const postFormInstance = async (formId: string, body: InstanceInput) => {
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

  await addFormInstance(validatedContent, instanceUri, formLabel);

  const id = await fetchInstanceIdByUri(instanceUri);

  return id;
};

export const getInstancesForForm = async (formId: string) => {
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

export const fetchInstanceAndForm = async (formId: string, id: string) => {
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

export const updateFormInstance = async (
  formId: string,
  instanceId: string,
  contentTtl: string,
) => {
  const { form, instance } = await fetchInstanceAndForm(formId, instanceId);

  const validatedContentTtl = await cleanAndValidateFormInstance(
    contentTtl,
    form,
    instance.instanceUri,
  );

  await updateFormInstanceDelta(instance, validatedContentTtl);

  const newInstance = await fetchFormInstanceById(form, instanceId);

  return { newInstance };
};

export const deleteFormInstance = async (
  formId: string,
  instanceId: string,
) => {
  const form = await fetchFormDefinitionById(formId);
  if (!form) {
    throw new HttpError('Form not found', 404);
  }

  const instanceUri = await fetchInstanceUriById(instanceId);
  if (!instanceUri) {
    throw new HttpError('Instance not found', 404);
  }

  await deleteFormInstanceDb(form.formTtl, instanceUri);

  // TODO at this stage inverse relations are kept intact even if the object gets deleted.
  // Would be better to replace this relation with a tombstone relation.
};
