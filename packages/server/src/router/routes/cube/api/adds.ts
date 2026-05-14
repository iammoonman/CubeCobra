import { makeFilter } from '@utils/filtering/FilterCards';
import { cubeDao } from 'dynamo/daos';
import {
  cardFromId,
  getAllMostReasonable,
  getReasonableCardByOracleWithPrintingPreference,
} from 'serverutils/carddb';
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

    // populate: false — we only need oracle_ids, which we can resolve from
    // carddb directly via cardFromId. Skipping the per-card details spread
    // saves ~one shallow copy per cube card (up to ~700).
    const cards = await cubeDao.getCards(cubeID, undefined, { populate: false });

    const oracles = cards.mainboard
      .map((card: any) => cardFromId(card.cardID)?.oracle_id)
      .filter(Boolean);

    const { adds } = await recommend(oracles);

    let slice;
    let { length } = adds;

    if (filterText && filterText.length > 0) {
      const { err, filter } = makeFilter(`${filterText}`);

      if (err || !filter) {
        return res.status(400).send({
          success: 'false',
          cardIDs: [],
          hasMoreAdds: false,
        });
      }

      const eligible = getAllMostReasonable(filter, printingPreference);
      length = eligible.length;

      const oracleToEligible = Object.fromEntries(eligible.map((card) => [card.oracle_id, true]));

      slice = adds.filter((item: any) => oracleToEligible[item.oracle]).slice(skip, skip + limit);
    } else {
      slice = adds.slice(skip, skip + limit);
    }

    // Return scryfall_ids only. The client resolves details from its IndexedDB
    // cache (utils/cardDetailsCache), batching any misses through
    // /cube/api/getdetailsforcards.
    return res.status(200).send({
      cardIDs: slice
        .map((item: any) => getReasonableCardByOracleWithPrintingPreference(item.oracle, printingPreference)?.scryfall_id)
        .filter(Boolean),
      hasMoreAdds: length > skip + limit,
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
