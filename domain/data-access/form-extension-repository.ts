import { QueryEngine } from '@comunica/query-sparql';
import { quadToString, ttlToStore } from '../../helpers/ttl-helpers';
import { sparqlEscapeUri, query } from 'mu';
import N3, { Quad } from 'n3';

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

const formExtensionHasPredicateSet = async (
  predicate: string,
  extensionFormTtl: string,
) => {
  const query = `
  PREFIX form: <http://lblod.data.gift/vocabularies/forms/>
  PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

  ASK {
    ?formUri a form:Extension.
    ?formUri ${predicate} ?o.
  }
  `;

  const store = await ttlToStore(extensionFormTtl);
  const hasMatches = await engine.queryBoolean(query, {
    sources: [store],
  });

  return hasMatches;
};

const addExtensionFieldGenerators = async (graph: string, store: N3.Store) => {
  const libraryUris = await getExtensionFieldLibraryEntries(graph, store);
  if (!libraryUris) {
    return;
  }
  await addUriGenerators(libraryUris, store, graph);
  await addShapes(libraryUris, store, graph);
};

const getExtensionFieldLibraryEntries = async (
  graph: string,
  store: N3.Store,
) => {
  const query = `
    PREFIX form: <http://lblod.data.gift/vocabularies/forms/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX prov: <http://www.w3.org/ns/prov#>

    SELECT DISTINCT ?libraryUri
    WHERE {
      GRAPH <${graph}> {
        ?s a form:Field;
           prov:wasDerivedFrom ?libraryUri.
      }
    }`;

  const bindingStream = await engine.queryBindings(query, { sources: [store] });
  const bindings = await bindingStream.toArray();
  if (bindings.length === 0) return;

  const libraryUris = bindings.map(
    (binding) => binding.get('libraryUri').value,
  );
  return libraryUris;
};

const addUriGenerators = async (
  libraryUris: string[],
  store: N3.Store,
  graph: string,
) => {
  const safeUris = libraryUris.map((uri) => sparqlEscapeUri(uri)).join(' ');
  const q = `
  PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
  CONSTRUCT {
    ?generator ?p ?o.
  } WHERE {
    VALUES ?libraryUri { ${safeUris} }
    ?libraryUri ext:needsGenerator ?generator.
    ?generator ?p ?o.
  }`;
  const results = await query(q);
  const triples = results.results.bindings
    .map((binding) => {
      return quadToString({
        subject: binding.s,
        predicate: binding.p,
        object: binding.o,
      } as unknown as Quad);
    })
    .join('\n');

  await ttlToStore(triples, store, graph);
};

const addShapes = async (
  libraryUris: string[],
  store: N3.Store,
  graph: string,
) => {
  // this only has support for simple shapes with one type for now. Doing more gets really complex in sparql.
  const safeUris = libraryUris.map((uri) => sparqlEscapeUri(uri)).join(' ');
  const q = `
  PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
  SELECT DISTINCT ?p ?type WHERE {
    VALUES ?libraryUri { ${safeUris} }
    ?libraryUri ext:needsShape ?shape.
    ?shape ?p ?o.
    ?o a ?type.
  }`;
  const results = await query(q);

  const promises = results.results.bindings.map((binding) => {
    const p = binding.p.value;
    const type = binding.type.value;

    const generatorShapeQuery = `
      PREFIX form: <http://lblod.data.gift/vocabularies/forms/>
      INSERT {
        GRAPH <${graph}> {
          ?shape ${sparqlEscapeUri(p)} [
            a ${sparqlEscapeUri(type)}
          ] .
        }
      }
      WHERE {
        GRAPH <${graph}> {
          ?gen a form:Generator.
          ?gen form:prototype / form:shape ?shape.
        }
      } `;

    engine.queryVoid(generatorShapeQuery, { sources: [store] });
  });

  await Promise.all(promises);
};

const addComplexPaths = async (graph: string, store: N3.Store) => {
  const nodes = await getExtensionFieldPaths(graph, store);
  if (!nodes) {
    return;
  }
  const nodesQuery = `
    CONSTRUCT {
      ?node ?p ?o.
    } WHERE {
      VALUES ?node {
        ${nodes.map((node) => sparqlEscapeUri(node)).join('\n')}
      }
      ?node ?p ?o.
    }
  `;
  const nodesResults = await query(nodesQuery);
  const nodesTriples = nodesResults.results.bindings
    .map((binding) => {
      return quadToString({
        subject: binding.s,
        predicate: binding.p,
        object: binding.o,
      } as unknown as Quad);
    })
    .join('\n');
  await ttlToStore(nodesTriples, store, graph);
};

const getExtensionFieldPaths = async (graph: string, store: N3.Store) => {
  const pathQuery = `
    PREFIX form: <http://lblod.data.gift/vocabularies/forms/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX prov: <http://www.w3.org/ns/prov#>
    PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
    PREFIX sh: <http://www.w3.org/ns/shacl#>

    SELECT DISTINCT ?path
    WHERE {
      GRAPH <${graph}> {
        ?s a form:Field;
           prov:wasDerivedFrom ?libraryUri ;
           sh:path ?path .
      }
    }`;

  const bindingStream = await engine.queryBindings(pathQuery, {
    sources: [store],
  });
  const bindings = await bindingStream.toArray();
  if (bindings.length === 0) {
    return;
  }

  const pathUris = bindings.map((binding) => binding.get('path').value);

  // added ?something sh:path ?path to get around a virtuoso bug
  const nodeQuery = `
  PREFIX sh: <http://www.w3.org/ns/shacl#>
  PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
  SELECT distinct ?node WHERE {
    VALUES ?path {
      ${pathUris.map((uri) => sparqlEscapeUri(uri)).join(' ')}
    }
    ?something sh:path ?path.
    ?path rdf:rest* ?node.
    FILTER (?node != <http://www.w3.org/1999/02/22-rdf-syntax-ns#nil>)
  }`;
  const nodeResults = await query(nodeQuery);
  if (nodeResults.results.bindings.length === 0) {
    return;
  }
  const nodeUris = nodeResults.results.bindings.map(
    (binding) => binding.node.value,
  );

  return nodeUris;
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
  addExtensionFieldGenerators,
  addComplexPaths,
};
