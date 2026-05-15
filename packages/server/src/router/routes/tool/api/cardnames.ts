import { normalizeName } from '@utils/cardutil';
import catalog from 'serverutils/cardCatalog';

import { Request, Response } from '../../../../types/express';

// Minimum prefix length before we run a query. Shorter prefixes match an
// unhelpfully large slice of the catalog, so the client suppresses them too.
const MIN_QUERY_LENGTH = 3;
const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 25;

// Card-name autocomplete. Replaces the old cardtree.json / full_names.json
// catalog files that were shipped whole to the browser — the matching now runs
// server-side against the in-memory sorted name arrays and only the top N
// suggestions cross the wire.
export const cardNamesHandler = async (req: Request, res: Response) => {
  try {
    const raw = typeof req.query.q === 'string' ? req.query.q : '';
    const full = req.query.full === '1' || req.query.full === 'true';

    let limit = DEFAULT_LIMIT;
    if (typeof req.query.limit === 'string') {
      const parsed = parseInt(req.query.limit, 10);
      if (!Number.isNaN(parsed)) {
        limit = Math.min(Math.max(parsed, 1), MAX_LIMIT);
      }
    }

    const query = normalizeName(raw);
    if (query.length < MIN_QUERY_LENGTH) {
      return res.status(200).send({ success: 'true', names: [] });
    }

    const source = full ? catalog.full_names : catalog.cardnames;
    const names: string[] = [];
    for (const name of source) {
      if (name.startsWith(query)) {
        names.push(name);
        if (names.length >= limit) {
          break;
        }
      }
    }

    return res.status(200).send({ success: 'true', names });
  } catch (err) {
    const error = err as Error;
    req.logger.error(error.message, error.stack);
    return res.status(500).send({
      success: 'false',
      message: 'Error retrieving card names',
    });
  }
};

export const routes = [
  {
    method: 'get',
    path: '/',
    handler: [cardNamesHandler],
  },
];
