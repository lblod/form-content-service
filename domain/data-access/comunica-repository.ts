import { QueryEngine } from '@comunica/query-sparql';
import { queryStore } from '../../helpers/query-store';
import { ttlToStore } from '../../helpers/ttl-helpers';
import N3 from 'n3';

const getFormPrefix = async (formTtl: string) => {
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

  const defaultPrefix = 'http://data.lblod.info/form-data/instances/';

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

  let prefix = binding.value;

  if (!prefix.endsWith('#') && !prefix.endsWith('/')) {
    prefix += '/';
  }
  return prefix;
};

export const getFormTargetAndLabel = async (formTtl: string) => {
  const q = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX form:  <http://lblod.data.gift/vocabularies/forms/>

    SELECT DISTINCT ?type ?label
    WHERE {
        ?form form:targetType ?type .
        ?form form:targetLabel ?label.
    }
    `;
  const store = await ttlToStore(formTtl);
  const engine = new QueryEngine();
  const bindingStream = await engine.queryBindings(q, {
    sources: [store],
  });

  const bindings = await bindingStream.toArray();
  if (!bindings.length) {
    throw new Error(
      'Unsupported Form: did not specify both target type and label',
    );
  }

  const type = bindings[0].get('type')?.value;
  const label = bindings[0].get('label')?.value;
  if (!type || !label || type.trim().length < 1 || label.trim().length < 1) {
    throw new Error('Empty type or label for form');
  }
  return { type, label };
};

const buildSelectFormOptionsQuery = () =>
  `
  PREFIX form: <http://lblod.data.gift/vocabularies/forms/>

  SELECT ?o
  WHERE {
    ?s form:options ?o
  }
  `;

const formOptionsToConceptSchemeUri = (binding): string => {
  const formOptionsJson: string = binding.get('o').value;
  const { conceptScheme } = JSON.parse(formOptionsJson);
  return conceptScheme;
};

const fetchConceptSchemeUris = async (formTtl: string): Promise<string[]> => {
  const query = buildSelectFormOptionsQuery();
  const store = await ttlToStore(formTtl);
  const bindings = await queryStore(query, store);

  return bindings.map(formOptionsToConceptSchemeUri);
};

const getUriTypes = async (ttl: string) => {
  const store = await ttlToStore(ttl);
  const types = await queryStore(
    `SELECT ?s ?type WHERE {
      ?s a ?type
    }`,
    store,
  );
  return types
    .map((binding) => {
      const type = binding.get('type')?.value;
      const uri = binding.get('s')?.value;
      if (!type || !uri) {
        return null;
      }
      return {
        uri,
        type,
      };
    })
    .filter((binding) => binding !== null) as { uri: string; type: string }[];
};

const isFormExtension = async (formTtl: string) => {
  const q = `
      PREFIX form: <http://lblod.data.gift/vocabularies/forms/>

      ASK {
          ?s ?p form:Extension .
      }
      `;
  const store = await ttlToStore(formTtl);
  const engine = new QueryEngine();
  const hasMatches = await engine.queryBoolean(q, {
    sources: [store],
  });

  return hasMatches;
};

const getBaseFormUri = async (formTtl: string) => {
  const q = `
      PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

      SELECT DISTINCT *
      WHERE {
          ?s ext:extendsForm ?o .
      }
      `;
  const store = await ttlToStore(formTtl);
  const engine = new QueryEngine();
  const bindingStream = await engine.queryBindings(q, {
    sources: [store],
  });

  const bindings = await bindingStream.toArray();
  if (bindings.length === 0) {
    throw new Error('Should contain ext:extendsForm predicate.');
  }

  const binding = bindings[0].get('o');

  if (!binding || binding.value.length < 1) {
    throw new Error('Should contain ext:extendsForm predicate.');
  }

  return binding.value;
};

const getFormUri = async (formTtl: string) => {
  const q = `
      PREFIX form:  <http://lblod.data.gift/vocabularies/forms/>

      SELECT DISTINCT *
      WHERE {
          ?s a ?o .
          VALUES ?o { form:Form form:Extension }
      }
      `;
  const store = await ttlToStore(formTtl);
  const engine = new QueryEngine();
  const bindingStream = await engine.queryBindings(q, {
    sources: [store],
  });

  const bindings = await bindingStream.toArray();
  if (bindings.length === 0) {
    throw new Error('Form does not contain a valid URI');
  }

  const binding = bindings[0].get('s');

  if (!binding || binding.value.length < 1) {
    throw new Error('Form does not contain a valid URI');
  }

  return binding.value;
};

const getFormId = async (formTtl: string) => {
  const q = `
      PREFIX form: <http://lblod.data.gift/vocabularies/forms/>
      PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

      SELECT DISTINCT *
      WHERE {
          ?s mu:uuid ?o .
      }
      `;
  const store = await ttlToStore(formTtl);
  const engine = new QueryEngine();
  const bindingStream = await engine.queryBindings(q, {
    sources: [store],
  });

  const bindings = await bindingStream.toArray();
  if (bindings.length === 0) {
    throw new Error('Form does not have a valid ID');
  }

  const binding = bindings[0].get('o');

  if (!binding || binding.value.length < 1) {
    throw new Error('Form does not have a valid ID');
  }

  return binding.value;
};

const mergeExtensionIntoBaseTtl = async (
  baseFormTtl: string,
  extensionFormTtl: string,
) => {
  const engine = new QueryEngine();
  const destinationStore = new N3.Store();
  const baseStore = await ttlToStore(baseFormTtl);

  const baseGraph = 'http://base';

  const query = `
  INSERT {
    GRAPH <${baseGraph}> {
      ?s ?p ?o.
    }
  } WHERE {
    ?s ?p ?o.
  }
  `;

  await engine.queryVoid(query, {
    sources: [baseStore],
    destination: destinationStore,
  });

  const constructAllFromGraph = (graph: string) =>
    `CONSTRUCT { ?s ?p ?o }
    WHERE {
      GRAPH <${graph}> {
        ?s ?p ?o
      } .
    }`;

  const result = await engine.queryQuads(constructAllFromGraph(baseGraph), {
    sources: [destinationStore],
  });
  const writer = new N3.Writer();
  writer.addPrefix('form', 'http://lblod.data.gift/vocabularies/forms/');
  const quads = await result.toArray();
  for (const quad of quads) {
    writer.addQuad(quad);
  }
  let formTtl;
  writer.end((error, result) => (formTtl = result));
  return formTtl;
};

export default {
  getFormPrefix,
  getFormTargetAndLabel,
  fetchConceptSchemeUris,
  getUriTypes,
  isFormExtension,
  getBaseFormUri,
  getFormUri,
  getFormId,
  mergeExtensionIntoBaseTtl,
};
