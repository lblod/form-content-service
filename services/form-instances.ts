import { HttpError } from '../domain/http-error';
import { cleanAndValidateFormInstance } from '../form-validator';
import { FormDefinition, InstanceData, InstanceInput } from '../types';
import { fetchFormDefinitionById } from './forms-from-config';
import formRepo from '../domain/data-access/form-repository';
import comunicaRepo from '../domain/data-access/comunica-repository';
import { fetchUserIdFromSession } from '../domain/data-access/user-repository';
import { uri } from 'rdflib';

export const postFormInstance = async (
  formId: string,
  body: InstanceInput,
  sessionId: string,
) => {
  const [userId, form] = await Promise.all([
    fetchUserIdFromSession(sessionId),
    fetchFormDefinitionById(formId),
  ]);
  if (!form) {
    throw new HttpError('Form not found', 404);
  }
  if (!userId) {
    throw new HttpError('Not authenticated', 401);
  }
  // fetch form content from body
  const { contentTtl, instanceUri } = body;

  const validatedContent = await cleanAndValidateFormInstance(
    contentTtl,
    form,
    instanceUri,
  );

  const [_ignoredAddResult, formData] = await Promise.all([
    formRepo.addFormInstance(validatedContent),
    comunicaRepo.getFormData(form.formTtl),
  ]);

  let versioningPromise = new Promise<void>((resolve) => resolve());
  if (formData.withHistory) {
    versioningPromise = formRepo.saveInstanceVersion(
      instanceUri,
      validatedContent,
      userId,
      'Created',
    );
  }

  const [id, _] = await Promise.all([
    formRepo.fetchInstanceIdByUri(instanceUri),
    versioningPromise,
  ]);

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

export const getHistoryForInstance = async (
  instanceId: string,
  options: { limit: number; offset: number },
) => {
  return await formRepo.getInstanceHistoryWithCount(instanceId, options);
};

export const getHistoryInstance = async (historyUri: string) => {
  return await formRepo.getHistoryInstance(historyUri);
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
  sessionId: string,
  description?: string,
) => {
  const [userId, { form, instance }] = await Promise.all([
    fetchUserIdFromSession(sessionId),
    fetchInstanceAndForm(formId, instanceId),
  ]);

  if (!userId) {
    throw new HttpError('Not authenticated', 401);
  }

  const [validatedContentTtl, formData] = await Promise.all([
    cleanAndValidateFormInstance(contentTtl, form, instance.instanceUri),
    comunicaRepo.getFormData(form.formTtl),
  ]);

  await formRepo.updateFormInstance(instance, validatedContentTtl);

  const newInstance = await fetchFormInstanceById(form, instanceId);

  if (formData.withHistory) {
    await formRepo.saveInstanceVersion(
      newInstance.instanceUri,
      newInstance.formInstanceTtl,
      userId,
      description,
    );
  }

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
};
