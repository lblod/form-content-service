import { expect, test, vi } from 'vitest';
import { fetchFormDefinition } from '../services/form-definitions';
import { fetchFormDefinitionById } from '../services/forms-from-config';
import comunicaRepository from '../domain/data-access/comunica-repository';
import formRepository from '../domain/data-access/form-repository';
import { query, sparqlEscapeString } from 'mu';

vi.mock('../services/forms-from-config', () => {
  return {
    fetchFormDefinitionById: vi.fn(),
  };
});
vi.mock('../domain/data-access/comunica-repository', () => {
  return {
    default: {
      getFormData: vi.fn(),
    },
  };
});
vi.mock('mu', () => {
  return {
    query: vi.fn(),
    sparqlEscapeString: vi.fn(),
  };
});

test('adds 1 + 2 to equal 3', () => {
  expect(1 + 2).toBe(3);
});

test('fetchFormDefinition', async () => {
  vi.mocked(fetchFormDefinitionById).mockResolvedValue({
    formTtl: 'formTtl',
    metaTtl: 'metaTtl',
  });
  vi.mocked(comunicaRepository.getFormData).mockResolvedValue({
    prefix: 'prefix',
    withHistory: false,
  });

  const result = await fetchFormDefinition('1');
  expect(result).toEqual({
    formTtl: 'formTtl',
    metaTtl: 'metaTtl',
    prefix: 'prefix',
    withHistory: false,
  });
  expect(vi.mocked(fetchFormDefinitionById)).toHaveBeenCalledTimes(1);
  expect(vi.mocked(comunicaRepository.getFormData)).toHaveBeenCalledTimes(1);
});

test('something with mu', async () => {
  vi.mocked(query).mockResolvedValue({
    results: {
      bindings: [{ formTtl: { value: 'formTtl' } }],
    },
  });
  vi.mocked(sparqlEscapeString).mockResolvedValue('foo!');
  const result = await formRepository.fetchFormTtlById('1');
  expect(result).toEqual('formTtl');
});
// test('adds 1 + 1 to equal 3', () => {
//   expect(1 + 1).toBe(3);
// });
