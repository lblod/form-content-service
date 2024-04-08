import { QueryEngine } from '@comunica/query-sparql';
import { queryStore } from '../../helpers/query-store';
import { ttlToStore } from '../../helpers/ttl-helpers';

const getFormData = async (formTtl: string) => {
  const q = `
      PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

      SELECT DISTINCT *
      WHERE {
          ?s ext:prefix ?prefix .
          OPTIONAL {
            ?s ext:withHistory ?withHistory .
          }
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
    return { prefix: defaultPrefix, withHistory: false };
  }

  let prefix = bindings[0].get('prefix')?.value;

  if (!prefix || prefix.length < 1) {
    throw new Error(
      'The form definition you tried to access defines an invalid form prefix!',
    );
  }

  if (!prefix.endsWith('#') && !prefix.endsWith('/')) {
    prefix += '/';
  }
  return {
    prefix,
    withHistory: !!bindings[0].get('withHistory')?.value,
  };
};

export const getFormTarget = async (formTtl: string) => {
  const q = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX form:  <http://lblod.data.gift/vocabularies/forms/>

    SELECT DISTINCT ?type
    WHERE {
        ?form form:targetType ?type .
    }
    `;
  const store = await ttlToStore(formTtl);
  const engine = new QueryEngine();
  const bindingStream = await engine.queryBindings(q, {
    sources: [store],
  });

  const bindings = await bindingStream.toArray();
  if (!bindings.length) {
    throw new Error('Unsupported Form: did not specify target type');
  }

  const type = bindings[0].get('type')?.value;
  if (!type || type.trim().length < 1) {
    throw new Error('Empty target type for form');
  }
  return type;
};

export const getFormLabels = async (formTtl: string): Promise<string[]> => {
  const q = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX form:  <http://lblod.data.gift/vocabularies/forms/>
    PREFIX sh: <http://www.w3.org/ns/shacl#>

    SELECT DISTINCT ?labelUri ?labelName
    WHERE {
        ?form form:targetLabel ?labelUri.
        ?field sh:path ?labelUri;
               sh:name ?labelName.
    }
    `;
  const store = await ttlToStore(formTtl);
  const engine = new QueryEngine();
  const bindingStream = await engine.queryBindings(q, {
    sources: [store],
  });

  // const labels: string[] = [];
  // bindingStream.on('data', (binding) => {
  //   labels.push(binding.get('label').value);
  // });

  // bindingStream.on('end', () => {
  //   console.log(labels);
  //   return labels;
  // });

  const bindings = await bindingStream.toArray();

  if (!bindings.length) {
    throw new Error('Unsupported Form: did not target label');
  }

  const labels = bindings.map((binding) => {
    return {
      name: binding.get('labelName')?.value ?? '',
      uri: binding.get('labelUri')?.value ?? '',
    };
  });

  return labels;
};

const fetchConceptSchemeUris = async (formTtl: string): Promise<string[]> => {
  const conceptTypes = [
    'conceptSchemeSelector',
    'conceptSchemeMultiSelector',
    'conceptSchemeRadioButtons',
    'conceptSchemeMultiSelectCheckboxes',
  ];
  const types = conceptTypes.map((m) => 'displayTypes:' + m).join(' ');

  const query = `
  PREFIX form: <http://lblod.data.gift/vocabularies/forms/>
  PREFIX displayTypes: <http://lblod.data.gift/display-types/>

  SELECT ?o
  WHERE {
    ?s form:displayType ?types.
    ?s form:options ?o.
    VALUES ?types { ${types} }
  }`;
  const store = await ttlToStore(formTtl);
  const bindings = await queryStore(query, store);

  return bindings.map((binding) => {
    const formOptionsJson = binding.get('o')?.value ?? '';
    const { conceptScheme } = JSON.parse(formOptionsJson);
    return conceptScheme;
  });
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

export default {
  getFormData,
  getFormTarget,
  getFormLabels,
  fetchConceptSchemeUris,
  getUriTypes,
};
