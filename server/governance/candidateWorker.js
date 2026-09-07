import { parentPort, workerData } from 'node:worker_threads'
import { detectGovernanceCandidates } from './candidates.js'

parentPort.postMessage(detectGovernanceCandidates(workerData.notes, workerData.dismissals))
