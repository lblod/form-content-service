import { QueryEngine } from '@comunica/query-sparql';
import { sparqlEscapeUri } from 'mu';
import N3 from 'n3';

import { ttlToStore } from '../../helpers/ttl-helpers';

const engine = new QueryEngine();

const isFormExtension = async (formTtl: string) => {
  const query = `
    PREFIX form: <http://lblod.data.gift/vocabularies/forms/>

    ASK {
        ?s ?p form:Extension .
    }
    `;
  const store = await ttlToStore(formTtl);
  const hasMatches = await engine.queryBoolean(query, {
    sources: [store],
  });

  return hasMatches;
};

const getBaseFormUri = async (formTtl: string) => {
  const query = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

    SELECT DISTINCT *
    WHERE {
        ?s ext:extendsForm ?o .
    }
    `;
  const store = await ttlToStore(formTtl);
  const engine = new QueryEngine();
  const bindingStream = await engine.queryBindings(query, {
    sources: [store],
  });

  const bindings = await bindingStream.toArray();
  if (bindings.length === 0) {
    throw new Error('Form Extension should contain ext:extendsForm predicate.');
  }

  const binding = bindings[0].get('o');

  if (!binding || binding.value.length < 1) {
    throw new Error('Form Extension should contain ext:extendsForm predicate.');
  }

  return binding.value;
};

const getFormUri = async (formTtl: string) => {
  const query = `
    PREFIX form:  <http://lblod.data.gift/vocabularies/forms/>

    SELECT DISTINCT *
    WHERE {
        ?s a ?o .
        VALUES ?o { form:Form form:Extension }
    }
    `;
  const store = await ttlToStore(formTtl);
  const engine = new QueryEngine();
  const bindingStream = await engine.queryBindings(query, {
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

const getFormId = async (formTtl: string): Promise<string> => {
  const query = `
    PREFIX form: <http://lblod.data.gift/vocabularies/forms/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

    SELECT DISTINCT *
    WHERE {
        ?s mu:uuid ?o .
    }
    `;
  const store = await ttlToStore(formTtl);
  const bindingStream = await engine.queryBindings(query, {
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

const loadTtlIntoGraph = async (
  ttl: string,
  graphUri: string,
  store: N3.Store,
) => {
  const baseStore = await ttlToStore(ttl);

  const query = `
    INSERT {
      GRAPH ${sparqlEscapeUri(graphUri)} {
        ?s ?p ?o.
      }
    } WHERE {
      ?s ?p ?o.
    }
    `;
  await engine.queryVoid(query, {
    sources: [baseStore],
    destination: store,
  });
};

const graphToTtl = async (graphUri: string, store: N3.Store) => {
  const query = `
    CONSTRUCT { ?s ?p ?o }
    WHERE {
      GRAPH ${sparqlEscapeUri(graphUri)} {
        ?s ?p ?o.
      } .
    }
    `;
  const result = await engine.queryQuads(query, {
    sources: [store],
  });
  const writer = new N3.Writer();
  const quads = await result.toArray();
  for (const quad of quads) {
    writer.addQuad(quad);
  }
  let formTtl;
  writer.end((error, result) => (formTtl = result));
  return formTtl;
};

const replaceExtendsGroup = async (graphUri: string, store: N3.Store) => {
  const query = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX sh: <http://www.w3.org/ns/shacl#>
    DELETE {
      GRAPH ${sparqlEscapeUri(graphUri)} {
        ?s ext:extendsGroup ?o.
      }
    }
    INSERT {
      GRAPH ${sparqlEscapeUri(graphUri)} {
        ?s sh:group ?o.
      }
    }
    WHERE {
      GRAPH ${sparqlEscapeUri(graphUri)} {
        ?s ext:extendsGroup ?o.
      }
    }
    `;
  await engine.queryVoid(query, { sources: [store] });
};

const replaceFormUri = async (graphUri: string, store: N3.Store) => {
  await replaceFormUriObject(graphUri, store);

  const query = `
    PREFIX form: <http://lblod.data.gift/vocabularies/forms/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX sh: <http://www.w3.org/ns/shacl#>

    DELETE {
      GRAPH ${sparqlEscapeUri(graphUri)} {
        ?form ?p ?o.
        ?extension a form:Extension.
      }
    }
    INSERT {
      GRAPH ${sparqlEscapeUri(graphUri)} {
        ?extension ?p ?o;
                   a form:Form.
      }
    }
    WHERE {
      GRAPH ${sparqlEscapeUri(graphUri)} {
        ?form a form:Form;
              ?p ?o.
        ?extension a form:Extension.
      }
    }
    `;
  await engine.queryVoid(query, { sources: [store] });
};

// Separate query from replaceFormUri due to a comunica issue.
// If the case where the form is used as an object is in an optional clause,
// the whole graph turns up empty.
const replaceFormUriObject = async (graphUri: string, store: N3.Store) => {
  const query = `
    PREFIX form: <http://lblod.data.gift/vocabularies/forms/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
  
    DELETE {
      GRAPH ${sparqlEscapeUri(graphUri)} {
        ?s ?p ?form.
      }
    }
    INSERT {
      GRAPH ${sparqlEscapeUri(graphUri)} {
        ?s ?p ?extension.
      }
    }
    WHERE {
      GRAPH ${sparqlEscapeUri(graphUri)} {
        ?form a form:Form.
        ?extension a form:Extension.
        ?s ?p ?form.
        # We still want ext:extendsForm to point to the base form
        FILTER (?p != ext:extendsForm)
      }
    }
    `;
  await engine.queryVoid(query, { sources: [store] });
};

const deleteAllFromBaseForm = async (
  predicateUris: string[],
  graphUri: string,
  store: N3.Store,
) => {
  const safePredicates = predicateUris.map((uri) => sparqlEscapeUri(uri));
  const query = `
    PREFIX form: <http://lblod.data.gift/vocabularies/forms/>
  
    DELETE {
      GRAPH ${sparqlEscapeUri(graphUri)} {
        ?s ?p ?o.
      }
    }
    WHERE {
      GRAPH ${sparqlEscapeUri(graphUri)} {
        ?s a form:Form;
        ?p ?o.
        VALUES ?p { ${safePredicates.join(' ')} }
      }
    }
    `;
  await engine.queryVoid(query, { sources: [store] });
};

const formExtensionHasPredicateSet = async (
  predicateUri: string,
  extensionFormTtl: string,
) => {
  const query = `
  PREFIX form: <http://lblod.data.gift/vocabularies/forms/>

  ASK {
    ?formUri a form:Extension.
    ?formUri ${sparqlEscapeUri(predicateUri)} ?o.
  }
  `;

  const store = await ttlToStore(extensionFormTtl);
  const hasMatches = await engine.queryBoolean(query, {
    sources: [store],
  });

  return hasMatches;
};

export default {
  isFormExtension,
  getBaseFormUri,
  getFormUri,
  getFormId,
  loadTtlIntoGraph,
  graphToTtl,
  replaceExtendsGroup,
  replaceFormUri,
  deleteAllFromBaseForm,
  formExtensionHasPredicateSet,
};
