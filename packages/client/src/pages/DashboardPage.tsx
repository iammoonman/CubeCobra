import React, { useContext } from 'react';

import BlogPost from '@utils/datatypes/BlogPost';
import Cube from '@utils/datatypes/Cube';
import Draft from '@utils/datatypes/Draft';
import { P1P1Pack } from '@utils/datatypes/P1P1Pack';

import Banner from 'components/Banner';
import Button from 'components/base/Button';
import Container from 'components/base/Container';
import { Col, Flexbox, Row } from 'components/base/Layout';
import Link from 'components/base/Link';
import Text from 'components/base/Text';
import CubePreview from 'components/cube/CubePreview';
import CubesCard from 'components/cube/CubesCard';
import DynamicFlash from 'components/DynamicFlash';
import Feed from 'components/Feed';
import HeroSearch from 'components/HeroSearch';
import DailyP1P1Card from 'components/p1p1/DailyP1P1Card';
import withQuickCreateCube from 'components/QuickCreateCubeButton';
import RecentDraftsCard from 'components/RecentDraftsCard';
import RenderToRoot from 'components/RenderToRoot';
import UserContext from 'contexts/UserContext';
import MainLayout from 'layouts/MainLayout';

interface DashboardPageProps {
  posts: BlogPost[];
  decks: Draft[];
  featured?: Cube[];
  collaboratingCubes?: Cube[];
  cubes?: Cube[];
  dailyP1P1?: {
    pack: P1P1Pack;
    cube: Cube;
    date?: number;
  };
  lastKey: any;
  lastDeckKey: any;
}

const CreateCubeModalButton = withQuickCreateCube(Button);

const DashboardPage: React.FC<DashboardPageProps> = ({
  posts,
  lastKey,
  lastDeckKey,
  decks,
  featured = [],
  collaboratingCubes = [],
  cubes = [],
  dailyP1P1,
}) => {
  const user = useContext(UserContext);

  // where featured cubes are positioned on the screen
  let featuredPosition;
  if (!user?.hideFeatured) {
    featuredPosition = cubes.length > 2 ? 'right' : 'left';
  }

  return (
    <MainLayout useContainer={false} transparentNav>
      <HeroSearch featured={featured} />
      <Container xxxl className="px-2">
        <Banner />
        <DynamicFlash />

        {/* MOBILE LAYOUT (< 768px) - Completely separate from desktop */}
        <div className="md:hidden">
          <Flexbox direction="col" gap="2" className="my-2 px-2">
            <div>
              <Flexbox direction="row" justify="between" className="px-2 mb-1">
                <Text semibold lg>
                  Your Cubes
                </Text>
                {cubes.length > 2 && <Link href={`/user/view/${user?.id}`}>View All</Link>}
              </Flexbox>
              {cubes.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2">
                  {cubes.slice(0, 4).map((cube) => (
                    <CubePreview key={cube.id} cube={cube} />
                  ))}
                </div>
              ) : (
                <div className="p-4">
                  <Flexbox direction="col" gap="2" alignItems="start">
                    <span>You don't have any cubes.</span>
                    <CreateCubeModalButton color="primary">Add a new cube?</CreateCubeModalButton>
                  </Flexbox>
                </div>
              )}
            </div>

            {collaboratingCubes.length > 0 && <CubesCard title="Collaborating On" cubes={collaboratingCubes} lean />}

            {!user?.hideFeatured && dailyP1P1 && (
              <DailyP1P1Card pack={dailyP1P1.pack} cube={dailyP1P1.cube} date={dailyP1P1.date} />
            )}

            <RecentDraftsCard decks={decks} lastKey={lastDeckKey} pageSize={5} />

            <Feed items={posts} lastKey={lastKey} />
          </Flexbox>
        </div>

        {/* DESKTOP LAYOUT (≥ 768px) */}
        <div className="hidden md:block">
          <Row className="my-2">
            <Col xs={12} md={6} xl={7}>
              <Flexbox direction="col" gap="2">
                <div>
                  <Flexbox direction="row" justify="between" className="px-2 mb-1">
                    <Text semibold lg>
                      Your Cubes
                    </Text>
                    {cubes.length > 2 && <Link href={`/user/view/${user?.id}`}>View All</Link>}
                  </Flexbox>
                  {cubes.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 3xl:grid-cols-4 5xl:grid-cols-5">
                      {cubes.slice(0, 12).map((cube) => (
                        <CubePreview key={cube.id} cube={cube} />
                      ))}
                    </div>
                  ) : (
                    <div className="p-4">
                      <Flexbox direction="col" gap="2" alignItems="start">
                        <span>You don't have any cubes.</span>
                        <CreateCubeModalButton color="primary">Add a new cube?</CreateCubeModalButton>
                      </Flexbox>
                    </div>
                  )}
                </div>
                {collaboratingCubes.length > 0 && (
                  <CubesCard title="Collaborating On" cubes={collaboratingCubes} lean />
                )}
                {featuredPosition === 'left' && dailyP1P1 && (
                  <DailyP1P1Card pack={dailyP1P1.pack} cube={dailyP1P1.cube} date={dailyP1P1.date} />
                )}
                <Feed items={posts} lastKey={lastKey} />
              </Flexbox>
            </Col>
            <Col xs={12} md={6} xl={5}>
              <Flexbox direction="col" gap="2">
                {featuredPosition === 'right' && dailyP1P1 && (
                  <DailyP1P1Card pack={dailyP1P1.pack} cube={dailyP1P1.cube} date={dailyP1P1.date} />
                )}
                <RecentDraftsCard decks={decks} lastKey={lastDeckKey} />
              </Flexbox>
            </Col>
          </Row>
        </div>
      </Container>
    </MainLayout>
  );
};

export default RenderToRoot(DashboardPage);
