import { Button, Layout, Progress, Select, Space, Typography } from 'antd';
import axios from 'axios';
import React, { useEffect, useState } from 'react';
import { apiUrl } from '../../utils/general';
import { Book } from '../../utils/types';

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

const BookReaderPage: React.FC = () => {
  const [books, setBooks] = useState<Book[]>([]);
  const [selectedBook, setSelectedBook] = useState<string | null>(null);
  const [chapters, setChapters] = useState<ChapterContent[]>([]);
  const [currentChapterIndex, setCurrentChapterIndex] = useState<number>(0);
  const [currentContentIndex, setCurrentContentIndex] = useState<number>(0);

  useEffect(() => {
    axios
      .get(apiUrl + '/api/books')
      .then((response) => setBooks(response.data))
      .catch((error) => console.error(error));
  }, []);

  const fetchBookContent = (bookId: string) => {
    axios
      .get(apiUrl + `/api/books/${bookId}`)
      .then((response) => {
        setChapters(response.data);
        setCurrentChapterIndex(0);
        setCurrentContentIndex(0);
      })
      .catch((error) => console.error(error));
  };

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
    setCurrentContentIndex(0); // Reset to the beginning of the chapter
  };

  const renderContentItem = (item: ContentItem) => {
    if (item.type === 'paragraph') {
      return (
        <Typography.Paragraph>
          {item.text}
          {item.src && (
            <img src={item.src} alt='' style={{ maxWidth: '100%' }} />
          )}
        </Typography.Paragraph>
      );
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

  console.log('currentChapter', currentChapter);
  console.log('currentContent', currentContent);
  console.log(books);
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
            <Option key={book.id} value={book.id}>
              {book.title}
            </Option>
          ))}
        </Select>
        {selectedBook && (
          <>
            <Title level={3}>Current Book: {selectedBook}</Title>
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

export default BookReaderPage;
