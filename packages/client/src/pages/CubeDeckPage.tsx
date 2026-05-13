import React, { useContext } from 'react';

import Cube from '@utils/datatypes/Cube';
import Draft from '@utils/datatypes/Draft';

import { Card, CardBody } from 'components/base/Card';
import { Col, Row } from 'components/base/Layout';
import Text from 'components/base/Text';
import CubeDeckNavbar from 'components/cube/CubeDeckNavbar';
import DeckCard from 'components/DeckCard';
import DynamicFlash from 'components/DynamicFlash';
import RenderToRoot from 'components/RenderToRoot';
import { DisplayContextProvider } from 'contexts/DisplayContext';
import UserContext from 'contexts/UserContext';
import useQueryParam from 'hooks/useQueryParam';
import CubeLayout from 'layouts/CubeLayout';
import MainLayout from 'layouts/MainLayout';

interface CubeDeckPageProps {
  cube: Cube;
  draft: Draft;
}

const CubeDeckPage: React.FC<CubeDeckPageProps> = ({ cube, draft }) => {
  const user = useContext(UserContext);
  const [seatIndex, setSeatIndex] = useQueryParam('seat', '0');
  const [view, setView] = useQueryParam('view', 'draft');

  const hasData = (draft.seats?.length ?? 0) > 0 && (draft.cards?.length ?? 0) > 0;

  return (
    <MainLayout useContainer={false}>
      <DisplayContextProvider cubeID={cube.id}>
        <CubeLayout cube={cube} activeLink="playtest">
          <DynamicFlash />
          {hasData ? (
            <>
              <CubeDeckNavbar
                draft={draft}
                user={user}
                seatIndex={seatIndex}
                setSeatIndex={setSeatIndex}
                view={view}
                setView={setView}
              />
              <Row className="mt-3 mb-3">
                <Col>
                  <DeckCard
                    seat={draft.seats[parseInt(seatIndex)]}
                    draft={draft}
                    seatIndex={`${seatIndex}`}
                    view={view}
                  />
                </Col>
              </Row>
            </>
          ) : (
            <Row className="mt-3 mb-3">
              <Col>
                <Card>
                  <CardBody>
                    <Text semibold lg>
                      This draft has no data.
                    </Text>
                    <Text className="text-text-secondary">
                      The seats and cards for this draft are missing. This usually means the draft was never finished
                      or its data was lost.
                    </Text>
                  </CardBody>
                </Card>
              </Col>
            </Row>
          )}
        </CubeLayout>
      </DisplayContextProvider>
    </MainLayout>
  );
};

export default RenderToRoot(CubeDeckPage);
