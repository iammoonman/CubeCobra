import { cubeDao } from 'dynamo/daos';
import Joi from 'joi';
import { getOracleForMl } from 'serverutils/carddb';
import { cubeContext } from 'serverutils/ml';

import { NextFunction, Request, Response } from '../../../../types/express';

interface CubeContextBody {
  cubeId: string;
}

const CubeContextBodySchema = Joi.object({
  cubeId: Joi.string().required(),
});

const validateBody = (req: Request, res: Response, next: NextFunction): void => {
  const { error } = CubeContextBodySchema.validate(req.body);
  if (error) {
    res.status(400).json({ error: error.details[0]?.message || 'Validation error' });
    return;
  }
  next();
};

const handler = async (req: Request, res: Response) => {
  const { cubeId } = req.body as CubeContextBody;

  try {
    const cards = await cubeDao.getCards(cubeId);
    if (!cards || !cards.mainboard) {
      return res.status(404).json({ error: 'Cube not found' });
    }

    const oracles = Array.from(
      new Set(
        cards.mainboard
          .map((card: any) => card.details?.oracle_id)
          .filter((id: string | undefined): id is string => Boolean(id))
          .map((id: string) => getOracleForMl(id, null)),
      ),
    );

    const embedding = await cubeContext(oracles);

    return res.status(200).send({ embedding });
  } catch (err) {
    req.logger.error(`Error encoding cube context: ${err}`, err instanceof Error ? err.stack : '');
    return res.status(500).json({ error: 'Error encoding cube context' });
  }
};

export const routes = [
  {
    path: '/',
    method: 'post',
    handler: [validateBody, handler],
  },
];
