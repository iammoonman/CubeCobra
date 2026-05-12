import { packageDao } from 'dynamo/daos';
import { handleRouteError } from 'serverutils/render';

import { Request, Response } from '../../../types/express';

const MAX_LIMIT = 100;

export const handler = async (req: Request, res: Response) => {
  try {
    const { owner, lastKey, limit } = req.body;

    if (!owner) {
      return res.status(400).send({ success: 'false', message: 'owner required' });
    }

    const requested = typeof limit === 'number' ? limit : 36;
    const clamped = Math.max(1, Math.min(MAX_LIMIT, requested));

    const result = await packageDao.queryByOwner(owner, 'date', false, lastKey || undefined, clamped);

    return res.status(200).send({
      success: 'true',
      packages: result.items || [],
      lastKey: result.lastKey,
    });
  } catch (err) {
    return handleRouteError(req, res, err as Error, '/404');
  }
};

export const routes = [
  {
    path: '/',
    method: 'post',
    handler: [handler],
  },
];
