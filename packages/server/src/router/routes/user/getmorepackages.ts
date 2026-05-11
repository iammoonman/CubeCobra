import { packageDao } from 'dynamo/daos';
import { handleRouteError } from 'serverutils/render';

import { Request, Response } from '../../../types/express';

export const handler = async (req: Request, res: Response) => {
  try {
    const { owner, lastKey } = req.body;

    if (!owner) {
      return res.status(400).send({ success: 'false', message: 'owner required' });
    }

    const result = await packageDao.queryByOwner(owner, 'date', false, lastKey || undefined, 36);

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
