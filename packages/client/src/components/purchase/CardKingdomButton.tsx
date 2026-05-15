import React from 'react';

import { detailsToCard } from '@utils/cardutil';
import { CardDetails } from '@utils/datatypes/Card';

import { getCardKingdomLink } from 'utils/Affiliate';
import { trackEvent } from 'utils/analytics';

import Button from '../base/Button';
import { Flexbox } from '../base/Layout';
import Text from '../base/Text';

interface PurchaseProps {
  card: CardDetails;
}

const CardKingdomButton: React.FC<PurchaseProps> = ({ card }) => {
  return (
    <Button
      type="link"
      outline
      color="accent"
      block
      href={getCardKingdomLink(detailsToCard(card))}
      target="_blank"
      onClick={() =>
        trackEvent('affiliate_click', { vendor: 'cardkingdom', scope: 'single', cards_value: card.prices.ck ?? 0 })
      }
    >
      <Flexbox direction="row" justify="between" className="w-full">
        <Text semibold>Card Kingdom</Text>
        {card.prices.ck && <Text semibold>{`$${card.prices.ck.toFixed(2)}`}</Text>}
      </Flexbox>
    </Button>
  );
};

export default CardKingdomButton;
