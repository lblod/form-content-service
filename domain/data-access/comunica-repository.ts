import { QueryEngine } from '@comunica/query-sparql';
import { ttlToStore } from '../../utils';

export const getFormPrefix = async (formTtl: string) => {
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

export const getFormLabel = async (formTtl: string) => {
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
