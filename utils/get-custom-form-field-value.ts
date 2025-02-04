import { query, sparqlEscapeUri } from 'mu';

export const complexPathUris = {
  address: 'https://data.vlaanderen.be/ns/persoon#verblijfsadres',
};

export const getAddressValue = async (instanceUri: string) => {
  const safe = {
    instance: sparqlEscapeUri(instanceUri),
  };
  const queryString = `
    PREFIX locn: <http://www.w3.org/ns/locn#>
    
    SELECT ?fullAddress
    WHERE {
      ${safe.instance} locn:fullAddress ?fullAddress .
    } LIMIT 1
  `;

  const queryResult = await query(queryString);

  return queryResult.results.bindings[0]?.fullAddress?.value ?? null;
};
