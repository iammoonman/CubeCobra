import React, { useEffect, useState } from 'react';

import ArticleType from '@utils/datatypes/Article';

import Button from 'components/base/Button';
import { Card, CardBody } from 'components/base/Card';
import { Flexbox } from 'components/base/Layout';
import Link from 'components/base/Link';
import { TabbedView } from 'components/base/Tabs';
import Text from 'components/base/Text';
import Article from 'components/content/Article';
import EditArticle from 'components/content/EditArticle';
import CSRFForm from 'components/CSRFForm';
import DynamicFlash from 'components/DynamicFlash';
import RenderToRoot from 'components/RenderToRoot';
import useQueryParam from 'hooks/useQueryParam';
import MainLayout from 'layouts/MainLayout';
import { fetchCardImage } from 'utils/cardAutocomplete';

interface EditArticlePageProps {
  article: ArticleType;
}

const EditArticlePage: React.FC<EditArticlePageProps> = ({ article }) => {
  const [tab, setTab] = useQueryParam('tab', '0');
  const [body, setBody] = useState(article.body);
  const [title, setTitle] = useState(article.title);
  const [short, setShort] = useState(article.short || '');
  const [imageName, setImageName] = useState(article.imageName);
  const [imageArtist, setImageArtist] = useState(article.image?.artist);
  const [imageUri, setImageUri] = useState(article.image?.uri);
  const saveFormRef = React.createRef<HTMLFormElement>();
  const submitFormRef = React.createRef<HTMLFormElement>();
  // No catalog to wait for anymore — the preview renders immediately.
  const loading = false;

  useEffect(() => {
    if (!imageName) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const image = await fetchCardImage(imageName, controller.signal);
      if (image) {
        setImageArtist(image.artist);
        setImageUri(image.uri);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [imageName]);

  const hasChanges =
    article.body !== body || article.title !== title || article.imageName !== imageName || article.short !== short;

  return (
    <MainLayout>
      <Card className="my-2">
        <CardBody>
          <Flexbox direction="row" justify="between">
            <Text semibold lg>
              Edit Article
            </Text>
            <Link href="/content/creators" className="float-end">
              Back to Dashboard
            </Link>
          </Flexbox>
          <Flexbox direction="row" className="gap-2">
            <CSRFForm
              method="POST"
              action="/content/editarticle"
              ref={saveFormRef}
              formData={{
                articleid: article.id,
                title: title || '',
                short: short || '',
                imagename: imageName || '',
                body: body || '',
              }}
            >
              <Button color="primary" block disabled={!hasChanges} onClick={() => saveFormRef.current?.submit()}>
                Save
              </Button>
            </CSRFForm>
            <CSRFForm
              method="POST"
              action="/content/submitarticle"
              ref={submitFormRef}
              formData={{
                articleid: article.id,
                title: title || '',
                short: short || '',
                imagename: imageName || '',
                body: body || '',
              }}
            >
              <Button color="primary" block disabled={!hasChanges} onClick={() => submitFormRef.current?.submit()}>
                Submit for Review
              </Button>
            </CSRFForm>
          </Flexbox>
        </CardBody>
        <DynamicFlash />
        <TabbedView
          activeTab={parseInt(tab)}
          tabs={[
            {
              label: 'Source',
              onClick: () => setTab('0'),
              content: (
                <EditArticle
                  article={article}
                  title={title || ''}
                  setTitle={setTitle}
                  short={short}
                  setShort={setShort}
                  imageName={imageName || ''}
                  setImageName={setImageName}
                  imageUri={imageUri || ''}
                  imageArtist={imageArtist || ''}
                  loading={loading}
                  body={body || ''}
                  setBody={setBody}
                />
              ),
            },
            {
              label: 'Preview',
              onClick: () => setTab('1'),
              content: (
                <Article
                  article={{
                    ...article,
                    title,
                    short,
                    imageName,
                    image: {
                      uri: imageUri || '',
                      artist: imageArtist || '',
                      id: article.image?.id || '',
                      imageName: imageName || '',
                    },
                  }}
                />
              ),
            },
          ]}
        />
      </Card>
    </MainLayout>
  );
};

export default RenderToRoot(EditArticlePage);
