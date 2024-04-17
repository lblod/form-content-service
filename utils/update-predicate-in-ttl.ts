import ForkingStore from 'forking-store';
import { NamedNode, Statement, Literal } from 'rdflib';

export const PREDICATE = {
  modified: new NamedNode('http://purl.org/dc/terms/modified'),
};

export const DATATYPE = {
  datetime: new NamedNode('http://www.w3.org/2001/XMLSchema#datetime'),
};

export const updatePredicateInTtl = async (
  instance: NamedNode,
  predicate: NamedNode,
  predicatevalue: Literal,
  ttlCode: string,
) => {
  const store = new ForkingStore();
  const sourceGraph = new NamedNode('http://data.lblod.info/sourceGraph');
  store.parse(ttlCode, sourceGraph, 'text/turtle');

  const currentMatches = store.match(
    instance,
    predicate,
    undefined,
    sourceGraph,
  );
  store.removeStatements(currentMatches);

  const statement = new Statement(
    instance,
    predicate,
    predicatevalue,
    sourceGraph,
  );
  store.addAll([statement]);

  return await store.serializeDataMergedGraph(sourceGraph);
};
