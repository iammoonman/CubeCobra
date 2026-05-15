import { normalizeName } from '@utils/cardutil';
import Image from '@utils/datatypes/Image';
import carddb, { cardFromId, getIdsFromName } from 'serverutils/carddb';

import { Request, Response } from '../../../../types/express';

// Single-card image lookup. Replaces the old imagedict.json (~28MB) that the
// browser downloaded whole just to resolve one card name → art. Mirrors the
// imagedict lookup in imageutil.getImageData but, unlike that helper, returns
// image: null when there is no real match (callers gate UI on a hit, so a
// silent default-card fallback would be wrong here).
const lookupImage = (rawName: string): Image | null => {
  const exact = carddb.imagedict[rawName.toLowerCase()];
  if (exact) {
    return exact;
  }

  const ids = getIdsFromName(normalizeName(rawName));
  if (ids && ids.length > 0 && ids[0]) {
    const card = cardFromId(ids[0]);
    if (card?.scryfall_id && card.art_crop && card.artist) {
      return {
        uri: card.art_crop,
        artist: card.artist,
        id: card.scryfall_id,
        imageName: rawName,
      };
    }
  }

  return null;
};

export const cardImageDataHandler = async (req: Request, res: Response) => {
  try {
    const name = typeof req.query.name === 'string' ? req.query.name : '';
    if (!name) {
      return res.status(400).send({ success: 'false', message: 'name is required' });
    }

    return res.status(200).send({ success: 'true', image: lookupImage(name) });
  } catch (err) {
    const error = err as Error;
    req.logger.error(error.message, error.stack);
    return res.status(500).send({
      success: 'false',
      message: 'Error retrieving card image',
    });
  }
};

export const routes = [
  {
    method: 'get',
    path: '/',
    handler: [cardImageDataHandler],
  },
];
