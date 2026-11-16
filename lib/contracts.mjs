import { readFileSync } from 'node:fs'
import { assertContracts } from '../sdk/harness/contracts.mjs'

// A single declaration owns the RPC, catalog and persisted-data boundaries.
export const contract = assertContracts(JSON.parse(readFileSync(new URL('../contracts/plugin.json', import.meta.url), 'utf8')))
