import { QueryEngine } from '@comunica/query-sparql';
import { queryStore } from '../../helpers/query-store';
import { ttlToStore } from '../../helpers/ttl-helpers';

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

export default { getFormPrefix, getFormTargetAndLabel, fetchConceptSchemeUris };
