import formExtRepo from '../domain/data-access/form-extension-repository';
import { HttpError } from '../domain/http-error';
import N3 from 'n3';
import { fetchFormDefinitionByUri } from './forms-from-config';

export const extendFormTtl = async (
  extensionFormTtl: string,
): Promise<string> => {
  const store = new N3.Store();
  const mergeGraph = 'http://merge';

  if (!(await formExtRepo.isFormExtension(extensionFormTtl))) {
    return extensionFormTtl;
  }

  const baseFormUri = await formExtRepo.getBaseFormUri(extensionFormTtl);
  const baseForm = await fetchFormDefinitionByUri(baseFormUri);
  if (!baseForm) throw new HttpError('Definition not found', 404);

  await formExtRepo.loadTtlIntoGraph(baseForm.formTtl, mergeGraph, store);
  await formExtRepo.loadTtlIntoGraph(extensionFormTtl, mergeGraph, store);

  await formExtRepo.deleteAllFromBaseForm(
    ['form:targetType', 'form:targetLabel', 'ext:prefix', 'mu:uuid'],
    mergeGraph,
    store,
  );

  await formExtRepo.replaceFormUri(mergeGraph, store);
  await formExtRepo.replaceExtendsGroup(mergeGraph, store);

  return await formExtRepo.graphToTtl(mergeGraph, store);
};
