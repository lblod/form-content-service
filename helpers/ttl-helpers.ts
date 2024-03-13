import { sparqlEscapeString, sparqlEscapeUri, sparqlEscape } from 'mu';
import { Quad } from 'n3';
import N3 from 'n3';

const parser = new N3.Parser();

const datatypeNames = {
  'http://www.w3.org/2001/XMLSchema#dateTime': 'dateTime',
  'http://www.w3.org/2001/XMLSchema#date': 'date',
  'http://www.w3.org/2001/XMLSchema#decimal': 'decimal',
  'http://www.w3.org/2001/XMLSchema#integer': 'int',
  'http://www.w3.org/2001/XMLSchema#float': 'float',
  'http://www.w3.org/2001/XMLSchema#boolean': 'bool',
};

export const sparqlEscapeObject = (bindingObject): string => {
  const escapeType = datatypeNames[bindingObject.datatype] || 'string';
  return bindingObject.type === 'uri'
    ? sparqlEscapeUri(bindingObject.value)
    : sparqlEscape(bindingObject.value, escapeType);
};

/**
 * The n3 Quad library's writer is not safe enough, let's use the mu encoding functions
 */
const quadToString = function (quad: Quad) {
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

export const ttlToTriplesAndPrefixes = function (ttl: string) {
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

  return { prefixLines, insertLines };
};

/**
 * This is a naive implementation that will not work for data of the format:
 * <#foo> <#bar> """this text talks about somthing. @prefix is a keyword. if left in text like this, it breaks our implementation""" .
 *
 * The text about prefix will be removed from the text and is a keyword will be interpreted as a prefix statement.
 *
 * We probably don't care.
 */
export const ttlToInsert = function (ttl) {
  const { insertLines, prefixLines } = ttlToTriplesAndPrefixes(ttl);

  return `${prefixLines.join('\n')}

  INSERT DATA {
    ${insertLines.join('.\n')}
  }`;
};

export const addTripleToTtl = function (
  ttl: string,
  s: string,
  p: string,
  o: string,
) {
  // eslint-disable-next-line prettier/prettier
  return `${ttl} ${sparqlEscapeUri(s)} ${sparqlEscapeUri(
    p,
  )} ${sparqlEscapeString(o)} .`;
};

export const computeInstanceDeltaQuery = async (
  oldInstanceTtl: string,
  newInstanceTtl: string,
) => {
  const oldStore = await ttlToStore(oldInstanceTtl);
  const newStore = await ttlToStore(newInstanceTtl);

  const removed: Quad[] = [];
  const added: Quad[] = [];

  oldStore.forEach(
    (quad) => {
      if (!newStore.has(quad)) {
        removed.push(quad);
      }
    },
    null,
    null,
    null,
    null,
  );

  newStore.forEach(
    (quad) => {
      if (!oldStore.has(quad)) {
        added.push(quad);
      }
    },
    null,
    null,
    null,
    null,
  );

  const remove = `
  DELETE DATA {
    GRAPH <http://mu.semte.ch/graphs/application> {
      ${removed.map((quad) => quadToString(quad)).join('\n')}
    }
  };`;
  const insert = `\nINSERT DATA {
    GRAPH <http://mu.semte.ch/graphs/application> {
      ${added.map((quad) => quadToString(quad)).join('\n')}
    }
  }`;

  let query = '';

  if (removed.length > 0) {
    query += remove;
  }
  if (added.length > 0) {
    query += insert;
  }

  return query.length > 0 ? query : null;
};
