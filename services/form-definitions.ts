import {
  fetchFormDefinitionById,
  fetchFormDefinitionByUri,
} from './forms-from-config';
import comunicaRepo from '../domain/data-access/comunica-repository';
import formExtRepo from '../domain/data-access/form-extension-repository';
import N3 from 'n3';

const mergeExtensionIntoBaseTtl = async (
  baseFormTtl: string,
  extensionFormTtl: string,
) => {
  const store = new N3.Store();
  const mergeGraph = 'http://merge';

  await formExtRepo.loadTtlIntoGraph(baseFormTtl, mergeGraph, store);
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

export const fetchFormDefinition = async (id: string) => {
  const formDefinition = await fetchFormDefinitionById(id);

  if (await formExtRepo.isFormExtension(formDefinition.formTtl)) {
    const baseFormUri = await formExtRepo.getBaseFormUri(
      formDefinition.formTtl,
    );
    const baseFormDefinition = await fetchFormDefinitionByUri(baseFormUri);
    const formTtl = await mergeExtensionIntoBaseTtl(
      baseFormDefinition.formTtl,
      formDefinition.formTtl,
    );
    const prefix = await comunicaRepo.getFormPrefix(formTtl);

    return {
      formTtl,
      metaTtl: formDefinition.metaTtl ?? baseFormDefinition.metaTtl,
      prefix,
    };
  }
  const prefix = await comunicaRepo.getFormPrefix(formDefinition.formTtl);
  return {
    formTtl: formDefinition.formTtl,
    metaTtl: formDefinition.metaTtl,
    prefix,
  };
};
