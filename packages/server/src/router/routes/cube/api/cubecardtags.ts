import { cubeDao } from 'dynamo/daos';
import { cubeCardTags, isCubeViewable } from 'serverutils/cubefn';

import { Request, Response } from '../../../../types/express';

const MIN_QUERY_LENGTH = 3;
const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 25;

export const cubecardtagsHandler = async (req: Request, res: Response) => {
  try {
    if (!req.params.id) {
      return res.status(400).send({
        success: 'false',
        message: 'Cube ID is required',
      });
    }

    const cube = await cubeDao.getById(req.params.id);

    if (!cube || !isCubeViewable(cube, req.user)) {
      return res.status(404).send({
        success: 'false',
        message: 'Not Found',
      });
    }

    const query = (typeof req.query.q === 'string' ? req.query.q : '').trim().toLowerCase();
    if (query.length < MIN_QUERY_LENGTH) {
      return res.status(200).send({ success: 'true', tags: [] });
    }

    let limit = DEFAULT_LIMIT;
    if (typeof req.query.limit === 'string') {
      const parsed = parseInt(req.query.limit, 10);
      if (!Number.isNaN(parsed)) {
        limit = Math.min(Math.max(parsed, 1), MAX_LIMIT);
      }
    }

    const cubeCards = await cubeDao.getCards(cube.id);
    const tags = cubeCardTags(cubeCards);
    const matches = tags.filter((tag: string) => tag.toLowerCase().startsWith(query)).slice(0, limit);

    return res.status(200).send({
      success: 'true',
      tags: matches,
    });
  } catch (err) {
    const error = err as Error;
    req.logger.error(error.message, error.stack);
    return res.status(500).send({
      success: 'false',
      message: 'Error retrieving cube card tags',
    });
  }
};

export const routes = [
  {
    method: 'get',
    path: '/:id',
    handler: [cubecardtagsHandler],
  },
];
