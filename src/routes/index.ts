import { Router } from 'express';
import { config, genlayerConfigured } from '../config/index.js';
import {
  createCase,
  getCase,
  getStatus,
  getVerdict,
  listCases,
  submitCase,
} from '../controllers/caseController.js';
import { store } from '../models/store.js';
import { DECISIONS_BY_INCIDENT, EVIDENCE_KINDS, INCIDENT_TYPES } from '../types/index.js';

export const router = Router();

/** Health + mode. The frontend uses `mode` to render the DEMO banner. */
router.get('/health', async (_req, res) => {
  // Actually probe the store. Reporting ok:true while the database is
  // unreachable is worse than useless — it hides the outage from the
  // platform's health check.
  const db = await store.ping();
  const healthy = db.ok;
  res.status(healthy ? 200 : 503).json({
    ok: healthy,
    service: 'varai-api',
    mode: config.demoMode ? 'DEMO' : 'GENLAYER',
    database: {
      kind: db.kind,
      ok: db.ok,
      // Named so it is obvious when cases will not survive a restart.
      persistent: db.kind === 'postgres',
      ...(db.error ? { error: db.error } : {}),
      ...(db.kind === 'memory'
        ? { warning: 'In-memory store — all cases are lost when the service restarts or sleeps.' }
        : {}),
    },
    genlayer: {
      configured: genlayerConfigured(),
      network: config.genlayer.network,
      contract: config.genlayer.contractAddress || null,
    },
    warning: config.demoMode
      ? 'Running in DEMO MODE. Verdicts are placeholders and are NOT GenLayer judgments.'
      : null,
  });
});

/** Vocabulary, so the frontend never hardcodes enums. */
router.get('/meta', (_req, res) => {
  res.json({
    ok: true,
    incidentTypes: INCIDENT_TYPES,
    decisionsByIncident: DECISIONS_BY_INCIDENT,
    evidenceKinds: EVIDENCE_KINDS,
    note: 'INSUFFICIENT_EVIDENCE may be returned for any incident type when the facts do not support a decision.',
  });
});

router.post('/cases', createCase);
router.get('/cases', listCases);
router.get('/cases/:id', getCase);
router.post('/cases/:id/submit', submitCase);
router.get('/cases/:id/status', getStatus);
router.get('/verdicts/:id', getVerdict);
