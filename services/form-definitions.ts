import { HttpError } from '../domain/http-error';
import { fetchFormDefinitionById } from './forms-from-config';
import comunicaRepo from '../domain/data-access/comunica-repository';

export const fetchFormDefinition = async (id: string) => {
  const form = await fetchFormDefinitionById(id);
  if (!form) {
    throw new HttpError('Form not found', 404);
  }
  const prefix = await comunicaRepo.getFormPrefix(form.formTtl);
  return { formTtl: form.formTtl, metaTtl: form.metaTtl, prefix };
};
