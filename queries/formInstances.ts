import { QueryEngine } from '@comunica/query-sparql';
import { ttlToStore } from '../utils';
import { sparqlEscapeString } from 'mu';

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

export const getFormInstancesQuery = (formId: string) => {
  const q = `
    PREFIX inst: <http://data.lblod.info/form-data/instances/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/> 
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

    SELECT DISTINCT ?uri ?id
    WHERE {
        ?uri ext:label ${sparqlEscapeString(formId)} .
        ?uri mu:uuid ?id .
    }
    `;

  return q;
};
