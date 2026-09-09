import { z } from 'zod';
import { config } from '../config/index.js';
import { INCIDENT_TYPES, EVIDENCE_KINDS } from '../types/index.js';

/**
 * Only http(s) is allowed, and only a hostname that looks real.
 * Blocks javascript:, data:, file: and localhost/private-range SSRF targets —
 * the contract may later be asked to fetch these references.
 */
const PRIVATE_HOST = /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?)/i;

export const urlSchema = z
  .string()
  .trim()
  .min(8)
  .max(2048)
  .superRefine((value, ctx) => {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Evidence URL is not a valid URL' });
      return;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Evidence URL must use http or https' });
    }
    if (PRIVATE_HOST.test(parsed.hostname)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Evidence URL may not point at a private or local address' });
    }
    if (!parsed.hostname.includes('.')) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Evidence URL must have a valid hostname' });
    }
  });

/** Strip control characters that would corrupt the prompt or the log. */
const cleanText = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    // eslint-disable-next-line no-control-regex
    .transform((s) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ''));

export const evidenceSchema = z
  .object({
    kind: z.enum(EVIDENCE_KINDS),
    value: z.string().trim().min(1).max(2048),
  })
  .superRefine((item, ctx) => {
    if (item.kind === 'IMAGE_URL' || item.kind === 'VIDEO_URL') {
      const res = urlSchema.safeParse(item.value);
      if (!res.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['value'],
          message: res.error.issues[0]?.message ?? 'Invalid URL',
        });
      }
    }
  });

export const createCaseSchema = z.object({
  competition: cleanText(120),
  homeTeam: cleanText(80),
  awayTeam: cleanText(80),
  minute: z.coerce.number().int().min(0).max(130),
  incidentType: z.enum(INCIDENT_TYPES),
  description: cleanText(config.security.maxDescriptionLength).refine(
    (s) => s.length >= 20,
    'Description must be at least 20 characters — the contract cannot judge a case with no facts',
  ),
  refereeCall: cleanText(200).optional(),
  evidence: z.array(evidenceSchema).max(config.security.maxEvidenceItems).optional().default([]),
});

export type CreateCaseInput = z.infer<typeof createCaseSchema>;

export const listQuerySchema = z.object({
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

/** Case ids we generate are uuids; reject anything else before it reaches SQL. */
export const idSchema = z
  .string()
  .trim()
  .regex(/^[a-zA-Z0-9_-]{6,64}$/, 'Invalid id');
