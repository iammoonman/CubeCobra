import React, { useContext } from 'react';

import { PackageIcon, PencilIcon, SparkleFillIcon } from '@primer/octicons-react';

import Button from 'components/base/Button';
import { Card, CardBody, CardHeader } from 'components/base/Card';
import { Flexbox } from 'components/base/Layout';
import Link from 'components/base/Link';
import Text from 'components/base/Text';
import SeedCrystalModal from 'components/modals/SeedCrystalModal';
import withModal from 'components/WithModal';
import CubeContext from 'contexts/CubeContext';
import DisplayContext from 'contexts/DisplayContext';

const SeedCrystalButton = withModal(Button, SeedCrystalModal);

/**
 * The welcome card shown in place of the empty cube list when the owner views
 * a brand-new cube. Provides three onboarding paths: edit sidebar, packages,
 * and seed crystal generator.
 */
const CubeEmptyState: React.FC = () => {
  const { cube } = useContext(CubeContext);
  const { setRightSidebarMode } = useContext(DisplayContext);

  return (
    <div className="my-6 max-w-3xl mx-auto px-4">
      <Card>
        <CardHeader>
          <Flexbox direction="row" alignItems="center" gap="2">
            <SparkleFillIcon size={20} />
            <Text lg semibold>
              Welcome to your new cube!
            </Text>
          </Flexbox>
        </CardHeader>
        <CardBody>
          <Flexbox direction="col" gap="4">
            <Text>
              Your cube is empty. Pick whichever way of getting started feels right — they all live alongside each other
              and you can mix and match later.
            </Text>

            <Flexbox direction="col" gap="3">
              <div className="border border-border rounded-md p-3">
                <Flexbox direction="row" gap="3" alignItems="start">
                  <div className="mt-1 text-text-secondary">
                    <PencilIcon size={18} />
                  </div>
                  <Flexbox direction="col" gap="1">
                    <Text semibold>Add cards in the edit sidebar</Text>
                    <div className="hidden md:block">
                      <Text sm>
                        The edit sidebar is already open on the right — search for individual cards, paste a list, or
                        upload a CSV.
                      </Text>
                    </div>
                    <div className="md:hidden">
                      <Text sm>
                        Tap the button below (or the edit icon in the top toolbar) to open the edit sidebar. From there
                        you can search for individual cards, paste a list, or upload a CSV.
                      </Text>
                      <div className="mt-2">
                        <Button color="secondary" onClick={() => setRightSidebarMode('edit')}>
                          Open the edit sidebar
                        </Button>
                      </div>
                    </div>
                  </Flexbox>
                </Flexbox>
              </div>

              <div className="border border-border rounded-md p-3">
                <Flexbox direction="row" gap="3" alignItems="start">
                  <div className="mt-1 text-text-secondary">
                    <PackageIcon size={18} />
                  </div>
                  <Flexbox direction="col" gap="1">
                    <Text semibold>Add cards from a package</Text>
                    <Text sm>Browse community-curated card packages and drop them straight into your cube.</Text>
                    <div>
                      <Link href="/packages">Browse packages</Link>
                    </div>
                  </Flexbox>
                </Flexbox>
              </div>

              <div className="border border-border rounded-md p-3">
                <Flexbox direction="row" gap="3" alignItems="start">
                  <div className="mt-1 text-text-secondary">
                    <SparkleFillIcon size={18} />
                  </div>
                  <Flexbox direction="col" gap="1">
                    <Text semibold>Start with a seed crystal</Text>
                    <Text sm>
                      Pick a single card you want at the heart of your cube — we'll grow a synergistic shell around it
                      using Smart Search. Use it to bootstrap a partial starting point you'll tweak by hand, or to spin
                      up a complete cube in one click. You can choose printing preference, card count, which colors to
                      include, and whether to keep things balanced.
                    </Text>
                    <div>
                      <SeedCrystalButton
                        color="primary"
                        modalprops={{
                          cubeId: cube.id,
                          defaultPrinting: cube.defaultPrinting,
                          defaultCardCount: 180,
                        }}
                      >
                        Use a seed crystal
                      </SeedCrystalButton>
                    </div>
                  </Flexbox>
                </Flexbox>
              </div>
            </Flexbox>
          </Flexbox>
        </CardBody>
      </Card>
    </div>
  );
};

export default CubeEmptyState;
