import { QueryEngine } from '@comunica/query-sparql';
import N3, { Quad } from 'n3';
import { query, sparqlEscapeString, sparqlEscapeUri, sparqlEscape } from 'mu';

const parser = new N3.Parser();
const sparql = new QueryEngine();

/**
 * This is a naive implementation that will not work for data of the format:
 * <#foo> <#bar> """this text talks about somthing. @prefix is a keyword. if left in text like this, it breaks our implementation""" .
 *
 * The text about prefix will be removed from the text and is a keyword will be interpreted as a prefix statement.
 *
 * We probably don't care.
 */
export const ttlToInsert = function (ttl) {
  const lines = ttl.split(/\.\s/);
  const prefixLines = [] as string[];
  const insertLines = [] as string[];

  lines.forEach((line) => {
    const trimmedLine = line.trim();
    if (trimmedLine.toLowerCase().startsWith('@prefix')) {
      prefixLines.push(`PREFIX ${trimmedLine.substring(8)}`);
    } else {
      insertLines.push(trimmedLine);
    }
  });

  return `${prefixLines.join('\n')}

  INSERT DATA {
    ${insertLines.join('.\n')}
  }`;
};

export const executeQuery = async (queryString, next) => {
  try {
    return await query(queryString);
  } catch (error) {
    next(new Error(error));
  }
};

export const queryStore = async function (query: string, store: N3.Store) {
  const bindingStream = await sparql.queryBindings(query, {
    sources: [store],
  });
  return await bindingStream.toArray();
};

export const ttlToStore = function (ttl: string): Promise<N3.Store> {
  const store = new N3.Store();

  return new Promise((resolve, reject) => {
    parser.parse(ttl, (error, quad) => {
      if (!quad) {
        resolve(store);
        return;
      }
      if (error) {
        console.error(error);
        reject(error);
      }
      store.addQuad(quad);
    });
  });
};

export const fetchInstanceUriById = async function (id: string) {
  const result = await query(`
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

    SELECT ?instance
    WHERE {
      ?instance mu:uuid ${sparqlEscapeString(id)} .
    } LIMIT 1
  `);

  if (result.results.bindings.length) {
    const binding = result.results.bindings[0];
    return binding.instance.value;
  } else {
    return null;
  }
};

export const fetchInstanceIdByUri = async function (uri: string) {
  const result = await query(`
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

    SELECT ?id
    WHERE {
      <${uri}> mu:uuid ?id.
    } LIMIT 1
  `);

  if (result.results.bindings.length) {
    const binding = result.results.bindings[0];
    return binding.id.value;
  } else {
    return null;
  }
};

/**
 * The n3 Quad library's writer is not safe enough, let's use the mu encoding functions
 */
export const quadToString = function (quad: Quad) {
  let object;
  if (quad.object.termType === 'Literal') {
    const datatype = quad.object.datatype;
    const dataTypeName = datatypeNames[datatype.value];
    object = sparqlEscape(quad.object.value, dataTypeName || 'string');
  } else {
    object = sparqlEscapeUri(quad.object.value);
  }
  return `${sparqlEscapeUri(quad.subject.value)} ${sparqlEscapeUri(
    quad.predicate.value,
  )} ${object} .`;
};

export const addTripleToTtl = function (
  ttl: string,
  s: string,
  p: string,
  o: string,
) {
  // eslint-disable-next-line prettier/prettier
  return `${ttl} ${sparqlEscapeUri(s)} ${sparqlEscapeUri(p)} ${sparqlEscapeString(o)} .`;
};

export class HttpError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export const modifierLookup = {
  // only inverse path is supported for now
  'http://www.w3.org/ns/shacl#inversePath': '^',
};

export const datatypeNames = {
  'http://www.w3.org/2001/XMLSchema#dateTime': 'dateTime',
  'http://www.w3.org/2001/XMLSchema#date': 'date',
  'http://www.w3.org/2001/XMLSchema#decimal': 'decimal',
  'http://www.w3.org/2001/XMLSchema#integer': 'int',
  'http://www.w3.org/2001/XMLSchema#float': 'float',
  'http://www.w3.org/2001/XMLSchema#boolean': 'bool',
};
