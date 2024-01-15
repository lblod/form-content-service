import { QueryEngine } from '@comunica/query-sparql';
import { executeQuery, ttlToStore } from '../utils';
import { sparqlEscapeString, sparqlEscapeUri } from 'mu';
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

export const getFormPrefix = async function (formTtl: string) {
  const q = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

    SELECT DISTINCT *
    WHERE {
        ?s ext:prefix ?o .
    }
    `;
  const store = await ttlToStore(formTtl);
  const engine = new QueryEngine();
  const bindingStream = await engine.queryBindings(q, {
    sources: [store],
  });

  const defaultPrefix = 'http://data.lblod.info/form-data/instances';

  const bindings = await bindingStream.toArray();
  if (bindings.length === 0) {
    return defaultPrefix;
  }

  const binding = bindings[0].get('o');

  if (!binding || binding.value.length < 1) {
    throw new Error(
      'The form definition you tried to access defines an invalid form prefix!',
    );
  }
  return binding.value;
};

export const getFormInstances = async (formLabel: string, next) => {
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

  const queryResult = await executeQuery(q, next);

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

export const deleteFormInstance = async function (instanceUri: string, next) {
  const q = `
    DELETE {
      ${sparqlEscapeUri(instanceUri)} ?p ?o.
    }
    WHERE {
      ${sparqlEscapeUri(instanceUri)} ?p ?o.
    }
    `;

  await executeQuery(q, next);
};
