import { FormDefinition, FormsFromConfig } from '../types';
import { promises as fs } from 'fs';
import formRepo from '../domain/data-access/form-repository';
import comunicaRepo from '../domain/data-access/comunica-repository';
import { HttpError } from '../domain/http-error';

const formsFromConfig: FormsFromConfig = {};
const formDirectory = '/forms';

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
): Promise<FormDefinition | null> => {
  const definitionFromConfig: FormDefinition | undefined =
    formsFromConfig[formId];

  const formTtl = await computeIfAbsent(
    definitionFromConfig || {},
    'formTtl',
    () => formRepo.fetchFormTtlById(formId),
  );

  if (!formTtl) throw new HttpError('Definition not found', 404);
  if (!definitionFromConfig) formsFromConfig[formId] = { formTtl };

  const metaTtl = await computeIfAbsent(definitionFromConfig, 'metaTtl', () =>
    fetchMetaTtlFromFormTtl(formTtl),
  );

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
  const formDirectories = await fs.readdir(formDirectory);
  formDirectories.forEach(async (formDirectory) => {
    const form = await loadConfigForm(formDirectory);
    formsFromConfig[formDirectory] = form;
  });
};
