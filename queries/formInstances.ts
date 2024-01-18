import { QueryEngine } from '@comunica/query-sparql';
import { ttlToStore } from '../utils';
import { sparqlEscapeString, query } from 'mu';
import { Instance } from '../types';

export const getFormLabel = async function (formTtl: string) {
  const q = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

    SELECT DISTINCT *
    WHERE {
        ?s ext:label ?o .
    }
    `;
  const store = await ttlToStore(formTtl);
  const engine = new QueryEngine();
  const bindingStream = await engine.queryBindings(q, {
    sources: [store],
  });

  const bindings = await bindingStream.toArray();
  if (bindings.length) {
    const binding = bindings[0].get('o');
    if (binding) {
      return binding.value;
    } else {
      return null;
    }
  } else {
    return null;
  }
};

export const getFormInstances = async (formLabel: string) => {
  const q = `
    PREFIX inst: <http://data.lblod.info/form-data/instances/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

    SELECT DISTINCT ?uri ?id
    WHERE {
        ?uri ext:label ${sparqlEscapeString(formLabel)} .
        ?uri mu:uuid ?id .
    }
    `;

  const queryResult = await query(q);

  const instance_values: Instance[] = [];

  queryResult.results.bindings.map((binding) => {
    const instance = {
      uri: binding.uri.value,
      id: binding.id.value,
      label: formLabel,
    };
    instance_values.push(instance);
  });

  const result = { instances: instance_values };
  return result;
};
