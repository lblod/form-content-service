import { QueryEngine } from '@comunica/query-sparql';

const sparql = new QueryEngine();

export const queryStore = async function (query: string, store: N3.Store) {
  const bindingStream = await sparql.queryBindings(query, {
    sources: [store],
  });
  return await bindingStream.toArray();
};
