import React from 'react';

import { detailsToCard } from '@utils/cardutil';
import { CardDetails } from '@utils/datatypes/Card';

import { getTCGLink } from 'utils/Affiliate';
import { trackEvent } from 'utils/analytics';

import Button from '../base/Button';
import { Flexbox } from '../base/Layout';
import Text from '../base/Text';

interface PurchaseProps {
  card: CardDetails;
}

const TCGPlayerButton: React.FC<PurchaseProps> = ({ card }) => {
  return (
    <Button
      type="link"
      outline
      color="accent"
      block
      href={getTCGLink(detailsToCard(card))}
      target="_blank"
      onClick={() =>
        trackEvent('affiliate_click', { vendor: 'tcgplayer', scope: 'single', cards_value: card.prices.usd ?? 0 })
      }
    >
      <Flexbox direction="row" justify="between" className="w-full">
        <Text semibold>TCGPlayer</Text>
        {card.prices.usd && <Text semibold>{`$${card.prices.usd.toFixed(2)}`}</Text>}
      </Flexbox>
    </Button>
  );
};

export default TCGPlayerButton;
