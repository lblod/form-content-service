import { NamedNode } from 'rdflib';
import { FormDefinition } from './types';
import ForkingStore from 'forking-store';

export const cleanAndValidateFormTtl = async function (
  formTtl: string,
  _form: FormDefinition,
  placeholderInstanceUri?: string,
) {
  const store = new ForkingStore();
  const validationGraph = new NamedNode('http://data.lblod.info/validation');
  await store.parse(formTtl, validationGraph);

  // TODO throw if form is invalid
  // TODO: LMB-29 create a construct query to clean the form input
  const cleanedTtl = await store.serializeDataMergedGraph(validationGraph);

  cleanedTtl.replace(placeholderInstanceUri, '');
  return cleanedTtl;
};
