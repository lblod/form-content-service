import { fetchFormDefinitionById } from './forms-from-config';
import comunicaRepo from '../domain/data-access/comunica-repository';

export const fetchFormDefinition = async (id: string) => {
  const formDefinition = await fetchFormDefinitionById(id);

  const { prefix, withHistory } = await comunicaRepo.getFormData(
    formDefinition.formTtl,
  );
  return {
    formTtl: `@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .\n${formDefinition.formTtl}`,
    metaTtl: `@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .\n${formDefinition.metaTtl}`,
    prefix,
    withHistory,
  };
};
