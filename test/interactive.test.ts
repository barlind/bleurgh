import { parseFastlyServices } from '../src/interactive';

describe('Interactive service selection', () => {
  test('parses Fastly CLI service output in display order', () => {
    const output = JSON.stringify([
      { id: 'service-2', name: 'Recently Updated', updated_at: '2026-09-24T12:00:00Z' },
      { id: 'service-1', name: 'Older Service', updated_at: '2026-09-23T12:00:00Z' }
    ]);

    expect(parseFastlyServices(output)).toEqual([
      { id: 'service-2', name: 'Recently Updated', updatedAt: '2026-09-24T12:00:00Z' },
      { id: 'service-1', name: 'Older Service', updatedAt: '2026-09-23T12:00:00Z' }
    ]);
  });

  test('accepts wrapped and capitalized Fastly CLI output', () => {
    const output = JSON.stringify({
      data: [{ ID: 'service-1', Name: 'Example Service', UpdatedAt: '2026-09-24T12:00:00Z' }]
    });

    expect(parseFastlyServices(output)).toEqual([
      { id: 'service-1', name: 'Example Service', updatedAt: '2026-09-24T12:00:00Z' }
    ]);
  });

  test('rejects an unexpected response shape', () => {
    expect(() => parseFastlyServices('{"services":[]}'))
      .toThrow('Fastly CLI returned an unexpected service list');
  });

  test('rejects services without an id and name', () => {
    expect(() => parseFastlyServices('[{"id":"service-1"}]'))
      .toThrow('Fastly CLI returned an invalid service at position 1');
  });
});