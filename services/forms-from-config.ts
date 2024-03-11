import { FormDefinition, FormsFromConfig, UriToIdMap } from '../types';
import { promises as fs } from 'fs';
import formRepo from '../domain/data-access/form-repository';
import comunicaRepo from '../domain/data-access/comunica-repository';
import formExtRepo from '../domain/data-access/form-extension-repository';
import { HttpError } from '../domain/http-error';
import N3 from 'n3';
import { extendFormTtl } from './form-extensions';

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

  let formTtl = await computeIfAbsent(
    definitionFromConfig || {},
    'formTtl',
    () => formRepo.fetchFormTtlById(formId),
  );

  if (!formTtl) throw new HttpError('Definition not found', 404);

  if (await formExtRepo.isFormExtension(formTtl)) {
    formTtl = await extendFormTtl(formTtl);
  }

  if (!definitionFromConfig) formsFromConfig[formId] = { formTtl };

  // TODO check how the meta ttl should be handled.
  // Probably want to combine meta ttl you fet from base graph with new meta ttl...
  let metaTtl = definitionFromConfig?.metaTtl ?? '';
  metaTtl += await fetchMetaTtlFromFormTtl(formTtl);

  return {
    formTtl,
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

  let formTtl = await formRepo.fetchFormTtlByUri(formUri);

  if (!formTtl) throw new HttpError('Definition not found', 404);

  if (await formExtRepo.isFormExtension(formTtl)) {
    formTtl = await extendFormTtl(formTtl);
  }

  // TODO this should be reviewed as well.
  const metaTtl = await fetchMetaTtlFromFormTtl(formTtl);

  formId = await formExtRepo.getFormId(formTtl);

  formsUriToId[formUri] = formId;
  formsFromConfig[formId] = { formTtl };

  return {
    formTtl,
    metaTtl,
  };
};

const loadConfigForm = async (formName: string) => {
  const filePath = `${formDirectory}/${formName}/form.ttl`;
  const metaPath = `${formDirectory}/${formName}/meta.ttl`;
  try {
    const specification = await fs.readFile(filePath, 'utf-8');
    const meta = await fs.readFile(metaPath, 'utf-8').catch(() => null);
    return { formTtl: specification, metaTtl: meta };
  } catch (error) {
    console.error(`Failed to load form ${formName}: ${error}`);
  }
};

export const loadFormsFromConfig = async () => {
  const formDirectories = await fetchFormDirectories();
  formDirectories.forEach(async (formDirectory) => {
    const form = await loadConfigForm(formDirectory);
    formsFromConfig[formDirectory] = form;
    if (!form) {
      return;
    }
    const formUri = await formExtRepo.getFormUri(form.formTtl);
    formsUriToId[formUri] = formDirectory;
  });
};

export const fetchFormDirectories = async () => {
  return await fs.readdir(formDirectory);
};
