import { QueryEngine } from '@comunica/query-sparql';
import N3 from 'n3';

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
