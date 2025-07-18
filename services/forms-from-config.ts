import { FormDefinition, FormsFromConfig, UriToIdMap } from '../types';
import { promises as fs } from 'fs';
import formRepo from '../domain/data-access/form-repository';
import comunicaRepo from '../domain/data-access/comunica-repository';
import formExtRepo from '../domain/data-access/form-extension-repository';
import { HttpError } from '../domain/http-error';
import { extendForm } from './form-extensions';

const formsFromConfig: FormsFromConfig = {};
const formDirectory = '/config';

const formsUriToId: UriToIdMap = {};

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

  let formTtl = definitionFromConfig?.formTtl;
  let custom = definitionFromConfig?.custom;
  let uri = definitionFromConfig?.uri;
  if (!formTtl) {
    const result = await formRepo.fetchFormTtlById(formId);
    formTtl = result?.formTtl;
    custom = result?.custom;
    uri = result?.uri;
  }

  if (!formTtl || !uri) throw new HttpError('Definition not found', 404);

  const formDefinition = await extendForm(uri, formTtl);

  let metaTtl = definitionFromConfig?.metaTtl ?? '';
  metaTtl += (await fetchMetaTtlFromFormTtl(formTtl)) ?? '';
  metaTtl += formDefinition.metaTtl ?? '';

  return {
    formTtl: formDefinition.formTtl,
    metaTtl,
    uri: formDefinition.uri,
    custom: !!custom,
  };
};

export const fetchFormDefinitionByUri = async (
  formUri: string,
): Promise<FormDefinition> => {
  let formId = formsUriToId[formUri];

  if (formId) {
    return fetchFormDefinitionById(formId);
  }

  const result = await formRepo.fetchFormTtlByUri(formUri);

  if (!result) throw new HttpError('Definition not found', 404);

  const { formTtl, custom } = result;

  const formDefinition = await extendForm(formUri, formTtl);

  let metaTtl = (await fetchMetaTtlFromFormTtl(formTtl)) ?? '';
  metaTtl += formDefinition.metaTtl ?? '';

  formId = await formExtRepo.getFormId(formTtl);

  formsUriToId[formUri] = formId;

  return {
    formTtl: formDefinition.formTtl,
    uri: formDefinition.uri,
    custom: formDefinition.custom || custom,
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

export const loadFormsFromConfig = async () => {
  const formDirectoryNames = await fetchFormDirectoryNames();

  let hasInvalidForm = false;

  for (const formDirectoryName of formDirectoryNames) {
    const formDefinition = await loadConfigForm(formDirectoryName);
    if (!formDefinition) {
      hasInvalidForm = true;
      continue;
    }
    const isValidForm = await comunicaRepo.isValidForm(formDefinition.formTtl);
    if (!isValidForm) {
      console.error(
        `Error: The ${formDirectoryName} form is invalid. Check if the form.ttl is correct and all prefixes are defined.`,
      );
      hasInvalidForm = true;
      continue;
    }

    const formUri = await formExtRepo.getFormUri(formDefinition.formTtl);
    formsFromConfig[formDirectoryName] = { ...formDefinition, uri: formUri };
    formsUriToId[formUri] = formDirectoryName;
  }

  if (hasInvalidForm) {
    throw new Error(
      'One or more forms are invalid. Check the logs for more information.',
    );
  }
};

export const fetchFormDirectoryNames = async () => {
  const directoryNames = await fs.readdir(formDirectory);

  return directoryNames.filter((name) => {
    const isFile = name.includes('.');
    if (isFile) {
      return;
    }
    return name;
  });
};
