import ForkingStore from 'forking-store';
import { NamedNode, Namespace, Statement, Literal } from 'rdflib';

const DCT = new Namespace('http://purl.org/dc/terms/');
const XSD = new Namespace('http://www.w3.org/2001/XMLSchema#');

export const PREDICATES = {
  modified: DCT('modified')
}
export const XSD_TYPES = {
  datetime: XSD('datetime')
}

export const updatePredicateInTtl = async (
  instance: NamedNode,
  predicate: Namespace,
  predicatevalue: Literal,
  ttlCode: string
) => {
  const store = new ForkingStore();
  const sourceGraph = new NamedNode('http://data.lblod.info/sourceGraph');
  store.parse(ttlCode, sourceGraph, 'text/turtle');

  const currentMatches = store.match(instance, predicate, undefined, sourceGraph);
  store.removeStatements(currentMatches);

  const statement = new Statement(
    instance,
    predicate,
    predicatevalue,
    sourceGraph
  )
  store.addAll([statement])
  return await store.serializeDataMergedGraph(sourceGraph);
}