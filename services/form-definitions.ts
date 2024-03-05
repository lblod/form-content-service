import {
  fetchFormDefinitionById,
  fetchFormDefinitionByUri,
} from './forms-from-config';
import comunicaRepo from '../domain/data-access/comunica-repository';

export const fetchFormDefinition = async (id: string) => {
  const formDefinition = await fetchFormDefinitionById(id);

  if (await comunicaRepo.isFormExtension(formDefinition.formTtl)) {
    const baseFormUri = await comunicaRepo.getBaseFormUri(
      formDefinition.formTtl,
    );
    const baseFormDefinition = await fetchFormDefinitionByUri(baseFormUri);
    await comunicaRepo.mergeExtensionIntoBaseTtl(
      baseFormDefinition.formTtl,
      formDefinition.formTtl,
    );
  }
  const prefix = await comunicaRepo.getFormPrefix(formDefinition.formTtl);
  return {
    formTtl: formDefinition.formTtl,
    metaTtl: formDefinition.metaTtl,
    prefix,
  };
};
