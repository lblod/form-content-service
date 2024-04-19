import { FormDefinition, FormsFromConfig, UriToIdMap } from '../types';
import { promises as fs } from 'fs';
import formRepo from '../domain/data-access/form-repository';
import comunicaRepo from '../domain/data-access/comunica-repository';
import formExtRepo from '../domain/data-access/form-extension-repository';
import { HttpError } from '../domain/http-error';
import { extendForm } from './form-extensions';

const formsFromConfig: FormsFromConfig = {};
const formDirectory = '/forms';

const formsUriToId: UriToIdMap = {};

const computeIfAbsent = async <Key, Value>(
  object,
  key: Key,
  mappingFunction: (key: Key) => Promise<Value>,
): Promise<Value | null> => {
  const value: Value | undefined = object[key];
  if (value) return value;

  const newValue = await mappingFunction(key);
  if (newValue) {
    object[key] = newValue;
    return newValue;
  }

  return null;
};

const fetchMetaTtlFromFormTtl = async (
  formTtl: string,
): Promise<string | null> => {
  const conceptSchemeUris = await comunicaRepo.fetchConceptSchemeUris(formTtl);
  if (!conceptSchemeUris.length) return null;

  return await formRepo.getConceptSchemeTriples(conceptSchemeUris);
};

export const fetchFormDefinitionById = async (
  formId: string,
): Promise<FormDefinition> => {
  const definitionFromConfig: FormDefinition | undefined =
    formsFromConfig[formId];

  const formTtl = await computeIfAbsent(
    definitionFromConfig || {},
    'formTtl',
    () => formRepo.fetchFormTtlById(formId),
  );

  if (!formTtl) throw new HttpError('Definition not found', 404);

  const formDefinition = await extendForm(formTtl);

  if (!definitionFromConfig) {
    formsFromConfig[formId] = { formTtl: formDefinition.formTtl };
  }

  let metaTtl = definitionFromConfig?.metaTtl ?? '';
  metaTtl += (await fetchMetaTtlFromFormTtl(formTtl)) ?? '';
  metaTtl += formDefinition.metaTtl ?? '';

  return {
    formTtl: formDefinition.formTtl,
    metaTtl,
  };
};

export const fetchFormDefinitionByUri = async (
  formUri: string,
): Promise<FormDefinition> => {
  let formId = formsUriToId[formUri];

  if (formId) {
    return fetchFormDefinitionById(formId);
  }

  const formTtl = await formRepo.fetchFormTtlByUri(formUri);

  if (!formTtl) throw new HttpError('Definition not found', 404);

  const formDefinition = await extendForm(formTtl);

  let metaTtl = (await fetchMetaTtlFromFormTtl(formTtl)) ?? '';
  metaTtl += formDefinition.metaTtl ?? '';

  formId = await formExtRepo.getFormId(formTtl);

  formsUriToId[formUri] = formId;
  formsFromConfig[formId] = { formTtl: formDefinition.formTtl };

  return {
    formTtl: formDefinition.formTtl,
    metaTtl,
  };
};

const loadConfigForm = async (formName: string) => {
  const formTtlPath = `${formDirectory}/${formName}/form.ttl`;
  const metaTtlPath = `${formDirectory}/${formName}/meta.ttl`;
  try {
    const formTtl = await fs.readFile(formTtlPath, 'utf-8');
    const metaTtl = await fs.readFile(metaTtlPath, 'utf-8').catch(() => null);
    return { formTtl, metaTtl };
  } catch (error) {
    console.error(`Failed to load form ${formName}: ${error}`);
  }
};

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

export const loadFormsFromConfig = async () => {
  const formDirectoryNames = await fetchFormDirectoryNames();
  //await delay(5000);

  for (const formDirectoryName of formDirectoryNames) {
    const formDefinition = await loadConfigForm(formDirectoryName);
    if (!formDefinition) {
      return;
    }
    const isValidForm = await formExtRepo.isValidForm(formDefinition.formTtl);
    if (!isValidForm) {
      console.error(
        `Form ${formDirectoryName} is not valid. Check if the form.ttl is correct and all prefixes are defined.`,
      );
      return;
    }

    formsFromConfig[formDirectoryName] = formDefinition;
    const formUri = await formExtRepo.getFormUri(formDefinition.formTtl);
    formsUriToId[formUri] = formDirectoryName;
  }
};

export const fetchFormDirectoryNames = async () => {
  return await fs.readdir(formDirectory);
};
