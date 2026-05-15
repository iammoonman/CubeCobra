import React from 'react';

import { detailsToCard } from '@utils/cardutil';
import { CardDetails } from '@utils/datatypes/Card';

import { getManaPoolLink } from 'utils/Affiliate';
import { trackEvent } from 'utils/analytics';

import Button from '../base/Button';
import { Flexbox } from '../base/Layout';
import Text from '../base/Text';

interface PurchaseProps {
  card: CardDetails;
}

const ManaPoolButton: React.FC<PurchaseProps> = ({ card }) => {
  return (
    <Button
      type="link"
      outline
      color="accent"
      block
      href={getManaPoolLink(detailsToCard(card))}
      target="_blank"
      onClick={() =>
        trackEvent('affiliate_click', { vendor: 'manapool', scope: 'single', cards_value: card.prices.mp ?? 0 })
      }
    >
      <Flexbox direction="row" justify="between" className="w-full">
        <Text semibold>Mana Pool</Text>
        {card.prices.mp && <Text semibold>{`$${card.prices.mp.toFixed(2)}`}</Text>}
      </Flexbox>
    </Button>
  );
};

export default ManaPoolButton;
