import { fetchFormDefinitionById } from '../form-repository';
import { getFormPrefix } from '../queries/formInstances';
import { HttpError } from '../utils';

export const fetchFormDefinition = async (id) => {
  const form = await fetchFormDefinitionById(id);
  if (!form) {
    throw new HttpError('Form not found', 404);
  }
  const prefix = await getFormPrefix(form.formTtl);
  return { formTtl: form.formTtl, metaTtl: form.metaTtl, prefix };
};
