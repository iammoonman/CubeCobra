import React from 'react';

import { cdnUrl } from '@utils/cdnUrl';
import Article from '@utils/datatypes/Article';
import { ContentType } from '@utils/datatypes/Content';
import Cube from '@utils/datatypes/Cube';
import Episode from '@utils/datatypes/Episode';
import { P1P1Pack } from '@utils/datatypes/P1P1Pack';
import Video from '@utils/datatypes/Video';

import { Card, CardBody, CardHeader } from 'components/base/Card';
import Container from 'components/base/Container';
import { Col, Flexbox, Row } from 'components/base/Layout';
import Link from 'components/base/Link';
import Text from 'components/base/Text';
import Banner from 'components/Banner';
import ArticlePreview from 'components/content/ArticlePreview';
import PodcastEpisodePreview from 'components/content/PodcastEpisodePreview';
import VideoPreview from 'components/content/VideoPreview';
import CubesCard from 'components/cube/CubesCard';
import DynamicFlash from 'components/DynamicFlash';
import HeroSearch from 'components/HeroSearch';
import DailyP1P1Card from 'components/p1p1/DailyP1P1Card';
import RenderToRoot from 'components/RenderToRoot';
import MainLayout from 'layouts/MainLayout';

interface LandingPageProps {
  featured: Cube[];
  content: Article[];
  dailyP1P1?: {
    pack: P1P1Pack;
    cube: Cube;
    date?: number;
  };
}

const LandingPage: React.FC<LandingPageProps> = ({ featured, content, dailyP1P1 }) => {
  return (
    <MainLayout useContainer={false} transparentNav>
      <HeroSearch />
      <Container xxxl className="px-2 pb-8">
        <DynamicFlash />
        <Banner />
        <Row className="mt-2">
          {dailyP1P1 && (
            <Col md={7} sm={12}>
              <DailyP1P1Card pack={dailyP1P1.pack} cube={dailyP1P1.cube} date={dailyP1P1.date} />
            </Col>
          )}
          <Col md={5} sm={12}>
            <Flexbox direction="col" gap="2">
              <CubesCard title="Featured Cubes" cubes={featured} lean sideLink={{ href: '/queue', text: 'View Queue' }}>
                <Text lg semibold>
                  <CardBody>
                    <Link href="/search">Search more Cubes...</Link>
                  </CardBody>
                </Text>
              </CubesCard>
              <Card>
                <CardHeader>
                  <Text semibold xl>
                    Looking for more cubes?
                  </Text>
                </CardHeader>
                <a href="https://luckypaper.co/resources/cube-map/" target="_blank" rel="noopener noreferrer">
                  <img className="w-full" src={cdnUrl('/content/cubemap.png')} alt="Cube Map" />
                </a>
                <CardBody>
                  <Text>
                    Discover just how diverse the Cube format can be, themes you never expected, and where your own cube
                    fits.
                  </Text>
                </CardBody>
              </Card>
            </Flexbox>
          </Col>
        </Row>
        <Banner />
        <Row className="mt-2">
          <Col xs={12}>
            <Card>
              <CardHeader>
                <Flexbox direction="row" justify="between">
                  <Text semibold lg>
                    Latest Content
                  </Text>
                  <Link href="/content/browse">View more...</Link>
                </Flexbox>
              </CardHeader>
              <Row gutters={0}>
                {content.map((item: Article) => (
                  <Col key={item.id} xxl={3} lg={4} sm={6}>
                    {item.type === ContentType.ARTICLE && <ArticlePreview article={item as Article} />}
                    {item.type === ContentType.VIDEO && <VideoPreview video={item as Video} />}
                    {item.type === ContentType.EPISODE && <PodcastEpisodePreview episode={item as any as Episode} />}
                  </Col>
                ))}
              </Row>
            </Card>
          </Col>
        </Row>
      </Container>
    </MainLayout>
  );
};

export default RenderToRoot(LandingPage);
