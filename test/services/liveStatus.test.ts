import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LiveStatusService, parseStatus } from '../../src/services/liveStatus.service.js';
import { UpstreamError } from '../../src/utils/errors.js';

const XML = `<AIRPORT_STATUS_INFORMATION><Update_Time>Mon Oct 5 12:15:54 2026 GMT</Update_Time>
<Delay_type><Name>Ground Stop Programs</Name><Ground_Stop_List><Program><ARPT>ATL</ARPT><Reason>equipment outage</Reason></Program></Ground_Stop_List></Delay_type>
<Delay_type><Name>Ground Delay Programs</Name><Ground_Delay_List>
  <Ground_Delay><ARPT>BOS</ARPT><Reason>wind</Reason><Avg>52 minutes</Avg></Ground_Delay>
  <Ground_Delay><ARPT>SFO</ARPT><Reason>low ceilings</Reason><Avg>1 hour</Avg></Ground_Delay>
</Ground_Delay_List></Delay_type></AIRPORT_STATUS_INFORMATION>`;

test('parseStatus groups FAA events by airport and delay type', () => {
  const doc = parseStatus(XML);
  assert.deepEqual(doc.byAirport.get('SFO'), [
    { type: 'Ground Delay Programs', details: { Reason: 'low ceilings', Avg: '1 hour' } },
  ]);
  assert.equal(doc.byAirport.get('ATL')![0]!.type, 'Ground Stop Programs');
});

test('serves the cached document within the TTL', async () => {
  let calls = 0;
  const service = new LiveStatusService(async () => (calls++, XML), 60_000);
  await service.get('BOS');
  await service.get('SFO');
  assert.equal(calls, 1);
});

test('serves stale data when a refresh fails, and errors only when nothing is cached', async () => {
  let fail = false;
  const service = new LiveStatusService(async () => {
    if (fail) throw new Error('down');
    return XML;
  }, 0);
  await service.get('BOS');
  fail = true;
  const stale = await service.get('BOS');
  assert.equal(stale.stale, true);
  assert.equal(stale.events.length, 1);

  const cold = new LiveStatusService(async () => {
    throw new Error('down');
  });
  await assert.rejects(cold.get('BOS'), UpstreamError);
});
