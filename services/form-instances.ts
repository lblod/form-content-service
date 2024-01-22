import { HttpError } from '../domain/http-error';
import { cleanAndValidateFormInstance } from '../form-validator';
import { FormDefinition, InstanceData, InstanceInput } from '../types';
import { fetchFormDefinitionById } from './forms-from-config';
import formRepo from '../domain/data-access/form-repository';
import comunicaRepo from '../domain/data-access/comunica-repository';

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

  await formRepo.addFormInstance(validatedContent);

  const id = await formRepo.fetchInstanceIdByUri(instanceUri);

  return id;
};

export const getInstancesForForm = async (
  formId: string,
  options: { limit: number; offset: number },
) => {
  const form = await fetchFormDefinitionById(formId);
  if (!form) {
    throw new HttpError('Form not found', 404);
  }

  const { type, label } = await comunicaRepo.getFormTargetAndLabel(
    form.formTtl,
  );

  return await formRepo.getFormInstancesWithCount(type, label, options);
};

const fetchFormInstanceById = async (
  form: FormDefinition,
  id: string,
): Promise<InstanceData> => {
  const instanceUri = await formRepo.fetchInstanceUriById(id);
  if (!instanceUri) {
    throw new HttpError('Instance not found', 404);
  }

  const instance = await formRepo.fetchFormInstanceByUri(
    form.formTtl,
    instanceUri,
  );

  if (!instance) {
    throw new HttpError('Instance data not found', 404);
  }

  return instance;
};

export const fetchInstanceAndForm = async (formId: string, id: string) => {
  const form = await fetchFormDefinitionById(formId);
  if (!form) {
    throw new HttpError('Form not found', 404);
  }
  const instance = await fetchFormInstanceById(form, id);

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

  await formRepo.updateFormInstance(instance, validatedContentTtl);

  const newInstance = await fetchFormInstanceById(form, instanceId);

  return { instance: newInstance };
};

export const deleteFormInstance = async (
  formId: string,
  instanceId: string,
) => {
  const form = await fetchFormDefinitionById(formId);
  if (!form) {
    throw new HttpError('Form not found', 404);
  }

  const instanceUri = await formRepo.fetchInstanceUriById(instanceId);
  if (!instanceUri) {
    throw new HttpError('Instance not found', 404);
  }

  await formRepo.deleteFormInstance(form.formTtl, instanceUri);

  // TODO at this stage inverse relations are kept intact even if the object gets deleted.
  // Would be better to replace this relation with a tombstone relation.
};
