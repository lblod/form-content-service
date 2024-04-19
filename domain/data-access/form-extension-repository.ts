import { QueryEngine } from '@comunica/query-sparql';
import { ttlToStore } from '../../helpers/ttl-helpers';
import N3 from 'n3';

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

const isValidForm = async (formTtl: string) => {
  const query = 'ASK { ?s ?p ?o. }';
  const store = await ttlToStore(formTtl);
  const engine = new QueryEngine();
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
  graphName: string,
  store: N3.Store,
) => {
  const baseStore = await ttlToStore(ttl);

  const query = `
    INSERT {
      GRAPH <${graphName}> {
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

const graphToTtl = async (graphName: string, store: N3.Store) => {
  const query = `
    CONSTRUCT { ?s ?p ?o }
    WHERE {
      GRAPH <${graphName}> {
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

const replaceExtendsGroup = async (graph: string, store: N3.Store) => {
  const query = `
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX sh: <http://www.w3.org/ns/shacl#>
    DELETE {
      GRAPH <${graph}> {
        ?s ext:extendsGroup ?o.
      }
    }
    INSERT {
      GRAPH <${graph}> {
        ?s sh:group ?o.
      }
    }
    WHERE {
      GRAPH <${graph}> {
        ?s ext:extendsGroup ?o.
      }
    }
    `;
  await engine.queryVoid(query, { sources: [store] });
};

const replaceFormUri = async (graph: string, store: N3.Store) => {
  await replaceFormUriObject(graph, store);

  const query = `
    PREFIX form: <http://lblod.data.gift/vocabularies/forms/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX sh: <http://www.w3.org/ns/shacl#>

    DELETE {
      GRAPH <${graph}> {
        ?form ?p ?o.
        ?extension a form:Extension.
      }
    }
    INSERT {
      GRAPH <${graph}> {
        ?extension ?p ?o;
                   a form:Form.
      }
    }
    WHERE {
      GRAPH <${graph}> {
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
const replaceFormUriObject = async (graph: string, store: N3.Store) => {
  const query = `
    PREFIX form: <http://lblod.data.gift/vocabularies/forms/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
  
    DELETE {
      GRAPH <${graph}> {
        ?s ?p ?form.
      }
    }
    INSERT {
      GRAPH <${graph}> {
        ?s ?p ?extension.
      }
    }
    WHERE {
      GRAPH <${graph}> {
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
  predicates: string[],
  graph: string,
  store: N3.Store,
) => {
  const query = `
    PREFIX form: <http://lblod.data.gift/vocabularies/forms/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  
    DELETE {
      GRAPH <${graph}> {
        ?s ?p ?o.
      }
    }
    WHERE {
      GRAPH <${graph}> {
        ?s a form:Form;
        ?p ?o.
        VALUES ?p { ${predicates.join(' ')} }
      }
    }
    `;
  await engine.queryVoid(query, { sources: [store] });
};

export default {
  isFormExtension,
  isValidForm,
  getBaseFormUri,
  getFormUri,
  getFormId,
  loadTtlIntoGraph,
  graphToTtl,
  replaceExtendsGroup,
  replaceFormUri,
  deleteAllFromBaseForm,
};
