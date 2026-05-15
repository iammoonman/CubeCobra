import React from 'react';

import { detailsToCard } from '@utils/cardutil';
import { CardDetails } from '@utils/datatypes/Card';

import { getCardHoarderLink } from 'utils/Affiliate';
import { trackEvent } from 'utils/analytics';

import Button from '../base/Button';
import { Flexbox } from '../base/Layout';
import Text from '../base/Text';

interface PurchaseProps {
  card: CardDetails;
}

const CardHoarderButton: React.FC<PurchaseProps> = ({ card }) => {
  return (
    <Button
      type="link"
      outline
      color="accent"
      block
      href={getCardHoarderLink(detailsToCard(card))}
      target="_blank"
      onClick={() =>
        trackEvent('affiliate_click', { vendor: 'cardhoarder', scope: 'single', cards_value: card.prices.tix ?? 0 })
      }
    >
      <Flexbox direction="row" justify="between" className="w-full">
        <Text semibold>CardHoarder</Text>
        {card.prices.tix && <Text semibold>{`${card.prices.tix.toFixed(2)} TIX`}</Text>}{' '}
      </Flexbox>
    </Button>
  );
};

export default CardHoarderButton;
