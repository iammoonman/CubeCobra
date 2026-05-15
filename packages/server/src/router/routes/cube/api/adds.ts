import { makeFilter } from '@utils/filtering/FilterCards';
import { cubeDao } from 'dynamo/daos';
import { cardFromId, getAllMostReasonable } from 'serverutils/carddb';
import { recommend } from 'serverutils/ml';

import { Request, Response } from '../../../../types/express';

export const addsHandler = async (req: Request, res: Response) => {
  try {
    let { skip, limit } = req.body;
    const { cubeID, filterText, printingPreference } = req.body;

    if (!cubeID) {
      return res.status(400).send({
        success: 'false',
        message: 'Cube ID is required',
        cardIDs: [],
        hasMoreAdds: false,
      });
    }

    limit = parseInt(limit, 10);
    skip = parseInt(skip, 10);

    // Smart Search is filter-driven. With no filter there is nothing to rank,
    // so return empty instead of dumping the whole recommender list.
    if (!filterText || `${filterText}`.trim().length === 0) {
      return res.status(200).send({ cardIDs: [], hasMoreAdds: false });
    }

    const { err, filter } = makeFilter(`${filterText}`);
    if (err || !filter) {
      return res.status(400).send({
        success: 'false',
        cardIDs: [],
        hasMoreAdds: false,
      });
    }

    // The two halves are independent, so run them concurrently:
    //   1. recommender — cube cards -> oracles -> ML service -> per-oracle rating
    //   2. filter       — apply the filter to the whole catalog
    // recommend() resolves to an empty list on any failure, so a flaky ML
    // service degrades to filter order rather than failing the request.
    const ratingsPromise = (async (): Promise<Map<string, number>> => {
      // populate: false — we only need oracle_ids, resolved via cardFromId.
      const cards = await cubeDao.getCards(cubeID, undefined, { populate: false });
      const oracles = cards.mainboard.map((card: any) => cardFromId(card.cardID)?.oracle_id).filter(Boolean);
      const { adds } = await recommend(oracles);
      return new Map(adds.map((a): [string, number] => [a.oracle, a.rating]));
    })();

    const eligible = getAllMostReasonable(filter, printingPreference);
    const ratings = await ratingsPromise;

    // Apply recommender scores to the filtered cards and sort by rating.
    // Cards the recommender didn't score keep their filter order at the bottom
    // (Array.sort is stable; equal ratings — including both unscored — return 0).
    const ranked = eligible
      .map((card) => ({ card, rating: ratings.get(card.oracle_id) ?? Number.NEGATIVE_INFINITY }))
      .sort((a, b) => (a.rating === b.rating ? 0 : b.rating - a.rating));

    const slice = ranked.slice(skip, skip + limit);

    // Return scryfall_ids only. The client resolves details from its IndexedDB
    // cache (utils/cardDetailsCache), batching any misses through
    // /cube/api/getdetailsforcards. getAllMostReasonable already picks the
    // printing-preferred version, so scryfall_id is the right printing.
    return res.status(200).send({
      cardIDs: slice.map((item) => item.card.scryfall_id).filter(Boolean),
      hasMoreAdds: ranked.length > skip + limit,
    });
  } catch (err) {
    const error = err as Error;
    req.logger.error(error.message, error.stack);
    return res.status(500).send({
      success: 'false',
      message: 'Error retrieving recommendations',
      cardIDs: [],
      hasMoreAdds: false,
    });
  }
};

export const routes = [
  {
    method: 'post',
    path: '',
    handler: [addsHandler],
  },
];
