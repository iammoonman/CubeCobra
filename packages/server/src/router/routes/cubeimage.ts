import { cubeDao } from 'dynamo/daos';
import { isCubeViewable } from 'serverutils/cubefn';
import { getImageData } from 'serverutils/imageutil';

import { Request, Response } from '../../types/express';

const FALLBACK_IMAGE_NAME = 'doubling cube [10e-321]';
const CACHE_HEADER = 'public, max-age=86400, stale-while-revalidate=604800';

const redirectToFallback = (res: Response) => {
  const fallback = getImageData(FALLBACK_IMAGE_NAME);
  if (!fallback?.uri) {
    return res.status(404).end();
  }
  res.set({ 'Cache-Control': CACHE_HEADER });
  return res.redirect(302, fallback.uri);
};

export const handler = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) {
      return redirectToFallback(res);
    }

    const cube = await cubeDao.getById(id);
    if (!cube || !isCubeViewable(cube, req.user)) {
      return redirectToFallback(res);
    }

    const image = cube.image ?? getImageData(cube.imageName);
    if (!image?.uri) {
      return redirectToFallback(res);
    }

    res.set({ 'Cache-Control': CACHE_HEADER });
    return res.redirect(302, image.uri);
  } catch (err) {
    req.logger?.error(`cubeimage handler failed for ${req.params.id}`, (err as Error).stack);
    return redirectToFallback(res);
  }
};

export const routes = [
  {
    path: '/:id',
    method: 'get',
    handler: [handler],
  },
];
