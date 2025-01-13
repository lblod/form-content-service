import formExtRepo from '../domain/data-access/form-extension-repository';
import { HttpError } from '../domain/http-error';
import N3 from 'n3';
import { fetchFormDefinitionByUri } from './forms-from-config';
import { FormDefinition } from '../types';

export const extendForm = async (
  extensionUri: string,
  extensionFormTtl: string,
): Promise<FormDefinition> => {
  const store = new N3.Store();
  const mergeGraph = 'http://merge';

  if (!(await formExtRepo.isFormExtension(extensionFormTtl))) {
    return {
      formTtl: extensionFormTtl,
      metaTtl: null,
      uri: extensionUri,
    };
  }

  const baseFormUri = await formExtRepo.getBaseFormUri(extensionFormTtl);
  const baseFormDefinition = await fetchFormDefinitionByUri(baseFormUri);
  if (!baseFormDefinition) throw new HttpError('Definition not found', 404);

  await formExtRepo.loadTtlIntoGraph(
    baseFormDefinition.formTtl,
    mergeGraph,
    store,
  );
  await formExtRepo.loadTtlIntoGraph(extensionFormTtl, mergeGraph, store);

  const predicatesToDeleteFromBase = await getDefinedPredicatesInExtensionForm(
    extensionFormTtl,
    ['form:targetType', 'form:targetLabel', 'ext:prefix'],
  );
  await formExtRepo.deleteAllFromBaseForm(
    [...predicatesToDeleteFromBase, 'mu:uuid'],
    mergeGraph,
    store,
  );

  await formExtRepo.replaceFormUri(mergeGraph, store);
  await formExtRepo.replaceExtendsGroup(mergeGraph, store);
  await formExtRepo.addExtensionFieldGenerators(mergeGraph, store);
  await formExtRepo.addComplexPaths(mergeGraph, store);

  const extendedFormTtl = await formExtRepo.graphToTtl(mergeGraph, store);

  return {
    formTtl: extendedFormTtl,
    metaTtl: baseFormDefinition.metaTtl,
    uri: extensionUri,
  };
};

const getDefinedPredicatesInExtensionForm = async (
  extensionFormTtl: string,
  predicatesToCheck: Array<string>,
) => {
  const definedPredicates: Array<string> = [];

  for (const predicate of predicatesToCheck) {
    const isDefined = await formExtRepo.formExtensionHasPredicateSet(
      predicate,
      extensionFormTtl,
    );
    if (isDefined) {
      definedPredicates.push(predicate);
    }
  }

  return definedPredicates;
};
