import { fetchFormDefinitionById } from './forms-from-config';
import comunicaRepo from '../domain/data-access/comunica-repository';

export const fetchFormDefinition = async (id: string) => {
  const formDefinition = await fetchFormDefinitionById(id);

  const { prefix, withHistory } = await comunicaRepo.getFormData(
    formDefinition.formTtl,
  );
  return {
    formTtl: formDefinition.formTtl,
    metaTtl: formDefinition.metaTtl,
    prefix,
    withHistory,
  };
};
