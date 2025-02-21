import { json2csv } from 'json-2-csv';

export function jsonToCsv(jsonArray) {
  if (!jsonArray || jsonArray.length === 0) {
    return '';
  }

  let csvString = '';
  try {
    csvString = json2csv(jsonArray);
  } catch (error) {
    throw new Error('Something went wrong while parsing json to a csv string.');
  }

  return csvString;
}
