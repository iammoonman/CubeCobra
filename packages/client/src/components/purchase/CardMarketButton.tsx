import React from 'react';

import { detailsToCard } from '@utils/cardutil';
import { CardDetails } from '@utils/datatypes/Card';

import { getCardMarketLink } from 'utils/Affiliate';
import { trackEvent } from 'utils/analytics';

import Button from '../base/Button';
import { Flexbox } from '../base/Layout';
import Text from '../base/Text';

interface PurchaseProps {
  card: CardDetails;
}

const CardMarketButton: React.FC<PurchaseProps> = ({ card }) => {
  return (
    <Button
      type="link"
      outline
      color="accent"
      block
      href={getCardMarketLink(detailsToCard(card))}
      target="_blank"
      onClick={() =>
        trackEvent('affiliate_click', { vendor: 'cardmarket', scope: 'single', cards_value: card.prices.eur ?? 0 })
      }
    >
      <Flexbox direction="row" justify="between" className="w-full">
        <Text semibold>CardMarket</Text>
        {card.prices.eur && <Text semibold>{`€${card.prices.eur.toFixed(2)}`}</Text>}
      </Flexbox>
    </Button>
  );
};

export default CardMarketButton;
