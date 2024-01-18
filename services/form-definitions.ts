import { fetchFormDefinitionById } from '../domain/data-access/form-repository';
import { getFormPrefix } from '../domain/data-access/comunica-repository';
import { HttpError } from '../domain/http-error';

export const fetchFormDefinition = async (id: string) => {
  const form = await fetchFormDefinitionById(id);
  if (!form) {
    throw new HttpError('Form not found', 404);
  }
  const prefix = await getFormPrefix(form.formTtl);
  return { formTtl: form.formTtl, metaTtl: form.metaTtl, prefix };
};
