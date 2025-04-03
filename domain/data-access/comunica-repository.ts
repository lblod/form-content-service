import { QueryEngine } from '@comunica/query-sparql';
import { queryStore } from '../../helpers/query-store';
import { ttlToStore } from '../../helpers/ttl-helpers';
import { Label } from '../../types';

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

export const getFormLabels = async (formTtl: string): Promise<Label[]> => {
  const store = await ttlToStore(formTtl);
  const engine = new QueryEngine();

  const q = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX form:  <http://lblod.data.gift/vocabularies/forms/>
    PREFIX sh: <http://www.w3.org/ns/shacl#>

    SELECT DISTINCT ?labelUri ?labelName ?displayType
    WHERE {
      ?form form:targetLabel ?labelUri.
      OPTIONAL {
        ?field sh:path ?labelUri ;
          sh:name ?labelName ;
          form:displayType ?displayType .
      }
    }`;

  const bindingStream = await engine.queryBindings(q, {
    sources: [store],
  });

  const bindings = await bindingStream.toArray();

  if (!bindings.length) {
    throw new Error('Unsupported Form: no valid target label supplied');
  }

  const labels = bindings.map((binding) => {
    return {
      name: binding.get('labelName')?.value ?? 'label',
      // Remove all spaces from this string, and transform the string to lowercase
      // as this is used as key in a later stage, which can't contain spaces.
      // we need to do this because we want to possibly filter on certain values
      // so the client will send a string that is transformed in the same way
      var:
        binding.get('labelName')?.value.replace(/ /g, '')?.toLowerCase() ??
        'label',
      type: binding.get('displayType')?.value ?? '',
      uri: binding.get('labelUri')?.value ?? '',
    };
  });

  return labels;
};

export const getDefaultFormLabels = async (
  formTtl: string,
): Promise<Label[] | null> => {
  const store = await ttlToStore(formTtl);
  const engine = new QueryEngine();

  const bindingStream = await engine.queryBindings(
    `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX form:  <http://lblod.data.gift/vocabularies/forms/>
    PREFIX sh: <http://www.w3.org/ns/shacl#>

    SELECT DISTINCT ?labelUri ?labelName ?displayType
    WHERE {
      ?form form:includes ?field.
      ?field a form:Field.
      ?field form:showInSummary true.
      ?field sh:path ?labelUri .
      ?field form:displayType ?displayType .
      ?field sh:name ?labelName .
    }`,
    { sources: [store] },
  );
  const bindings = await bindingStream.toArray();
  if (!bindings.length) {
    return getFormLabels(formTtl);
  }
  return bindings.map((binding) => {
    return {
      name: binding.get('labelName')?.value ?? 'label',
      // Remove all spaces from this string, and transform the string to lowercase
      // as this is used as key in a later stage, which can't contain spaces.
      // we need to do this because we want to possibly filter on certain values
      // so the client will send a string that is transformed in the same way
      type: binding.get('displayType')?.value ?? '',
      var:
        binding.get('labelName')?.value.replace(/ /g, '')?.toLowerCase() ??
        'label',
      uri: binding.get('labelUri')?.value ?? '',
    };
  });
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

/*
 * Best effort check to see if the form is valid
 * The N3 parser is lenient and will sometimes still parse a form, even if it uses unknown prefixes.
 */
const isValidForm = async (formTtl: string) => {
  const query = `
  PREFIX form: <http://lblod.data.gift/vocabularies/forms/>

  ASK {
    ?s a ?o.
    VALUES ?o { form:Form form:Extension }
  }`;
  const store = await ttlToStore(formTtl);
  const engine = new QueryEngine();
  const hasMatches = await engine.queryBoolean(query, {
    sources: [store],
  });

  return hasMatches;
};

export default {
  getFormData,
  getFormTarget,
  getFormLabels,
  getDefaultFormLabels,
  fetchConceptSchemeUris,
  getUriTypes,
  isValidForm,
};
