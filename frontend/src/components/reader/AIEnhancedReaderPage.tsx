import {
  Button,
  Image,
  Layout,
  Progress,
  Select,
  Space,
  Spin,
  Typography,
} from 'antd';
import axios from 'axios';
import React, { useEffect, useState } from 'react';

const { Content } = Layout;
const { Title } = Typography;
const { Option } = Select;

interface ContentItem {
  type: string;
  text?: string;
  src?: string;
  size?: string;
}

interface ChapterContent {
  order: number;
  chapterTitle: string;
  contents: ContentItem[];
}

interface AiModel {
  name: string;
  fileName: string;
  modelId: number;
}

const AIEnhancedReaderPage: React.FC = () => {
  const [books, setBooks] = useState<string[]>([]);
  const [selectedBook, setSelectedBook] = useState<string | null>(null);
  const [chapters, setChapters] = useState<ChapterContent[]>([]);
  const [currentChapterIndex, setCurrentChapterIndex] = useState<number>(0);
  const [currentContentIndex, setCurrentContentIndex] = useState<number>(0);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [loadingImage, setLoadingImage] = useState<boolean>(false);
  const [downloadedModels, setDownloadedModels] = useState<AiModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>();
  const [downloadedLoras, setDownloadedLoras] = useState<AiModel[]>([]);
  const [selectedLoras, setSelectedLoras] = useState<string[]>([]);

  const baseUrl = 'http://localhost:5000/api';

  useEffect(() => {
    axios
      .get(baseUrl + '/books')
      .then((response) => setBooks(response.data))
      .catch((error) => console.error(error));

    // Fetch downloaded models
    axios
      .get(baseUrl + '/ai-models/list-models')
      .then((response) => {
        setDownloadedModels(response.data);
      })
      .catch((error) => console.error(error));

    // Fetch downloaded LoRAs
    axios
      .get(baseUrl + '/ai-models/list-loras')
      .then((response) => {
        setDownloadedLoras(response.data);
      })
      .catch((error) => console.error(error));
  }, []);

  const fetchBookContent = (bookId: string) => {
    axios
      .get(`${baseUrl}/books/${bookId}`)
      .then((response) => {
        setChapters(response.data);
        setCurrentChapterIndex(0);
        setCurrentContentIndex(0);
        setGeneratedImage(null);
      })
      .catch((error) => console.error(error));
  };
  console.log('models:', downloadedModels);
  console.log('loras:', downloadedLoras);

  const generateImage = async () => {
    const currentContent =
      chapters[currentChapterIndex]?.contents[currentContentIndex];
    const prompt = currentContent?.text || '';
    if (!prompt || !selectedModel) return;

    setLoadingImage(true);

    try {
      const response = await axios.post(`${baseUrl}/generate-image`, {
        prompt,
        loras: selectedLoras,
        model: selectedModel,
      });
      setGeneratedImage(`data:image/png;base64,${response.data.image}`);
    } catch (error) {
      console.error('Error generating image:', error);
    }

    setLoadingImage(false);
  };

  useEffect(() => {
    if (
      selectedModel &&
      chapters.length > 0 &&
      chapters[currentChapterIndex]?.contents[currentContentIndex]
    ) {
      generateImage();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentChapterIndex, currentContentIndex, selectedModel, selectedLoras]);

  const handleNextContent = () => {
    const chapter = chapters[currentChapterIndex];
    if (currentContentIndex < chapter.contents.length - 1) {
      setCurrentContentIndex(currentContentIndex + 1);
    } else if (currentChapterIndex < chapters.length - 1) {
      setCurrentChapterIndex(currentChapterIndex + 1);
      setCurrentContentIndex(0);
    }
  };

  const handlePreviousContent = () => {
    if (currentContentIndex > 0) {
      setCurrentContentIndex(currentContentIndex - 1);
    } else if (currentChapterIndex > 0) {
      const prevChapterIndex = currentChapterIndex - 1;
      const prevChapterContentLength =
        chapters[prevChapterIndex].contents.length;
      setCurrentChapterIndex(prevChapterIndex);
      setCurrentContentIndex(prevChapterContentLength - 1);
    }
  };

  const handleChapterChange = (chapterIndex: number) => {
    setCurrentChapterIndex(chapterIndex);
    setCurrentContentIndex(0);
  };

  const handleModelChange = (value: string) => {
    setSelectedModel(value);
  };

  const handleLoraSelection = (values: string[]) => {
    setSelectedLoras(values);
  };

  const renderContentItem = (item: ContentItem) => {
    if (item.type === 'paragraph') {
      return <Typography.Paragraph>{item.text}</Typography.Paragraph>;
    } else if (item.type === 'title') {
      const headingMap: { [key: string]: 1 | 2 | 3 | 4 | 5 } = {
        h1: 1,
        h2: 2,
        h3: 3,
        h4: 4,
        h5: 5,
        h6: 5,
      };

      const headingLevel = headingMap[item.size as string] || 2;
      return <Title level={headingLevel}>{item.text}</Title>;
    } else if (item.type === 'image') {
      return <img src={item.src} alt='' style={{ maxWidth: '100%' }} />;
    } else {
      return <Typography.Text>{item.text}</Typography.Text>;
    }
  };

  const currentChapter = chapters[currentChapterIndex];
  const currentContent = currentChapter
    ? currentChapter.contents[currentContentIndex]
    : null;

  const readingProgress = currentChapter
    ? Math.round(
        ((currentContentIndex + 1) / currentChapter.contents.length) * 100
      )
    : 0;

  return (
    <Layout>
      <Content style={{ padding: '50px' }}>
        <Select
          placeholder='Select a book'
          style={{ width: 300, marginBottom: '20px' }}
          onChange={(value) => {
            setSelectedBook(value);
            fetchBookContent(value);
          }}
        >
          {books.map((book) => (
            <Option key={book} value={book}>
              {book}
            </Option>
          ))}
        </Select>
        {selectedBook && (
          <>
            <Title level={3}>Current Book: {selectedBook}</Title>
            {/* Model Selection */}
            <div style={{ marginBottom: '20px' }}>
              <h2>Select a Model</h2>
              <Select
                style={{ width: 300 }}
                value={selectedModel}
                onChange={handleModelChange}
              >
                {downloadedModels.map((model) => (
                  <Option key={model.modelId} value={model.fileName}>
                    {model.name}
                  </Option>
                ))}
              </Select>
            </div>
            {/* LORA Selection */}
            <div style={{ marginBottom: '20px' }}>
              <h2>Select LoRAs to Include</h2>
              <Select
                mode='multiple'
                style={{ width: '100%' }}
                placeholder='Select LoRAs'
                value={selectedLoras}
                onChange={handleLoraSelection}
              >
                {downloadedLoras.map((lora) => (
                  <Option key={lora.modelId} value={lora.fileName}>
                    {lora.name}
                  </Option>
                ))}
              </Select>
            </div>
            {chapters.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <Title level={4}>
                  Current Chapter: {currentChapter.chapterTitle}
                </Title>
                <Select
                  value={currentChapterIndex}
                  onChange={handleChapterChange}
                  style={{ width: 200 }}
                >
                  {chapters.map((chapter, index) => (
                    <Option key={index} value={index}>
                      {chapter.chapterTitle}
                    </Option>
                  ))}
                </Select>
              </div>
            )}
            {loadingImage ? (
              <Spin size='large' />
            ) : generatedImage ? (
              <div style={{ marginBottom: '20px' }}>
                <Image
                  src={generatedImage}
                  alt='Generated'
                  style={{ maxWidth: '100%' }}
                />
              </div>
            ) : null}
            {currentContent ? (
              <div style={{ marginBottom: '20px' }}>
                {renderContentItem(currentContent)}
              </div>
            ) : (
              <Typography.Paragraph>
                No content available in this chapter.
              </Typography.Paragraph>
            )}
            <Space>
              <Button
                onClick={handlePreviousContent}
                disabled={
                  currentChapterIndex === 0 && currentContentIndex === 0
                }
              >
                Previous
              </Button>
              <Button
                onClick={handleNextContent}
                disabled={
                  currentChapterIndex === chapters.length - 1 &&
                  currentContentIndex === currentChapter.contents.length - 1
                }
              >
                Next
              </Button>
            </Space>
            <div style={{ marginTop: '20px' }}>
              <Title level={5}>Reading Progress</Title>
              <Progress percent={readingProgress} />
            </div>
          </>
        )}
      </Content>
    </Layout>
  );
};

export default AIEnhancedReaderPage;
