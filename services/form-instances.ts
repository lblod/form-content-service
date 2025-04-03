import { HttpError } from '../domain/http-error';
import { cleanAndValidateFormInstance } from '../form-validator';
import { FormDefinition, InstanceData, InstanceInput, Label } from '../types';
import { fetchFormDefinitionById } from './forms-from-config';
import formRepo from '../domain/data-access/form-repository';
import comunicaRepo from '../domain/data-access/comunica-repository';
import { fetchUserIdFromSession } from '../domain/data-access/user-repository';
import { jsonToCsv } from '../utils/json-to-csv-string';

import { query, sparqlEscapeString } from 'mu';

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
  options?: {
    limit?: number;
    offset?: number;
    sort?: string;
    filter?: string;
    labels?: Array<Label>;
  },
) => {
  const form = await fetchFormDefinitionById(formId);
  if (!form) {
    throw new HttpError('Form not found', 404);
  }

  const type = await comunicaRepo.getFormTarget(form.formTtl);
  let labels = options.labels;
  if (!labels || labels.length === 0) {
    labels = await comunicaRepo.getDefaultFormLabels(form.formTtl);
  }

  return await formRepo.getFormInstancesWithCount(type, labels, options);
};

export const getHistoryForInstance = async (
  instanceId: string,
  options: { limit: number; offset: number },
) => {
  return await formRepo.getInstanceHistoryWithCount(instanceId, options);
};

export const createHistoryForInstance = async (
  formId: string,
  instanceId: string,
  sessionId: string,
  description?: string,
) => {
  const form = await fetchFormDefinitionById(formId);
  if (!form) {
    throw new HttpError('Form not found', 404);
  }

  const [instance, userId] = await Promise.all([
    fetchFormInstanceById(form, instanceId),
    fetchUserIdFromSession(sessionId),
  ]);

  if (!instance) {
    throw new HttpError('Instance not found', 404);
  }
  if (!userId) {
    throw new HttpError('Not authenticated', 401);
  }

  await formRepo.saveInstanceVersion(
    instance.instanceUri,
    instance.formInstanceTtl,
    userId,
    description,
  );

  return instance.formInstanceTtl;
};

export const getHistoryInstance = async (historyUri: string) => {
  const historyTtlWithoutPrefixes =
    await formRepo.getHistoryInstance(historyUri);
  return {
    formInstanceTtl: `@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .\n${historyTtlWithoutPrefixes}`,
  };
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

  if (formData.withHistory && !(await formRepo.hasHistoryItems(instanceId))) {
    await formRepo.saveInstanceVersion(
      instance.instanceUri,
      instance.formInstanceTtl,
      userId,
      'Originele versie',
    );
  }

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

export const instancesAsCsv = async (
  formId: string,
  labels: Array<Label>,
  options: {
    sort?: string;
    offset?: number;
    limit?: number;
  } = { limit: 9999 }, // Get all instances
): Promise<string> => {
  const result = await getInstancesForForm(formId, {
    labels,
    ...options,
  });
  const instancePropertiesForLabels = result.instances.map((instance) => {
    return Object.fromEntries(
      Object.entries(instance).filter(([key]) =>
        labels.map((l) => l.name).includes(key),
      ),
    );
  });

  const withNullReplaced = instancePropertiesForLabels.map((instance) => {
    return Object.fromEntries(
      Object.entries(instance).map(([key, value]) => {
        return [key, value ?? ''];
      }),
    );
  });

  return jsonToCsv(withNullReplaced);
};

export const getInstanceUsageCount = async (instanceId: string) => {
  const queryString = `
      PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
      PREFIX form: <http://lblod.data.gift/vocabularies/forms/>
      PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
  
      SELECT (COUNT(DISTINCT ?usage) AS ?count)
      WHERE {
        ?instance mu:uuid ${sparqlEscapeString(instanceId)} .
        ?usage ?p ?instance .
      }
    `;
  const queryResult = await query(queryString);
  const count = queryResult.results.bindings?.at(0)?.count.value || '0';

  return parseInt(count);
};
