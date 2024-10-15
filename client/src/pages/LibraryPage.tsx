import { UploadOutlined } from '@ant-design/icons';
import { Button, Card, Col, message, Row, Upload } from 'antd';
import { RcFile, UploadProps } from 'antd/es/upload/interface';
import axios from 'axios';
//@ts-ignore
import * as pdfjs from 'pdfjs-dist/webpack.mjs';
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiUrl } from '../utils/general';
import { Book } from '../utils/types';

interface Chapter {
  title: string;
  order: number;
  passages: Passage[];
  subChapters?: Chapter[];
}

interface OutlineItem {
  title: string;
  dest: any;
  items?: OutlineItem[];
}

interface Passage {
  textContent: string;
  order: number;
}

const LibraryPage: React.FC = () => {
  const navigate = useNavigate();
  const [books, setBooks] = useState<Book[]>([]);
  const [uploading, setUploading] = useState<boolean>(false);

  const fetchBooks = () => {
    axios
      .get(`${apiUrl}/api/books/`)
      .then((response) => {
        setBooks(response.data);
      })
      .catch((error) => {
        message.error(`Error fetching books: ${error}`);
      });
  };

  useEffect(() => {
    fetchBooks();
  }, []);

  const handleUpload: UploadProps['beforeUpload'] = (file: RcFile): boolean => {
    setUploading(true);

    const isPdf = file.type === 'application/pdf';

    if (isPdf) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const arrayBuffer = e.target?.result as ArrayBuffer;

        try {
          // Load the PDF using pdfjs-dist
          const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
          const pdf: PDFDocumentProxy = await loadingTask.promise;

          // Extract chapters and passages
          const numPages = pdf.numPages;

          // Get the outline (table of contents)
          const outline: OutlineItem[] | null = await pdf.getOutline();

          let chapters: Chapter[] = [];

          if (outline && outline.length > 0) {
            chapters = await processOutline(outline, pdf);
          } else {
            // If no outline, treat the entire document as one chapter
            throw new Error('The PDF file has no outline (table of contents).');
          }

          // Send the extracted data to the server
          const bookData = {
            title: file.name,
            chapters,
          };

          axios
            .post(`${apiUrl}/api/books/upload`, bookData)
            .then(() => {
              message.success(`${file.name} uploaded successfully.`);
              fetchBooks(); // Refresh the list of books after upload
            })
            .catch((error) => {
              message.error(`Error uploading file: ${error}`);
            })
            .finally(() => {
              setUploading(false);
            });
        } catch (error) {
          console.error(error);
          message.error(`Error processing PDF: ${error}`);
          setUploading(false);
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      // Handle other file types as before
      const formData = new FormData();
      formData.append('file', file);

      axios
        .post(`${apiUrl}/api/books/upload`, formData)
        .then(() => {
          message.success(`${file.name} uploaded successfully.`);
          fetchBooks(); // Refresh the list of books after upload
        })
        .catch((error) => {
          message.error(`Error uploading file: ${error}`);
        })
        .finally(() => {
          setUploading(false);
        });
    }

    return false; // Prevent default upload behavior
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
      <h1>Your Library</h1>
      <Upload
        beforeUpload={handleUpload}
        accept='.pdf,.epub'
        showUploadList={false}
      >
        <Button icon={<UploadOutlined />} loading={uploading}>
          {uploading ? 'Uploading' : 'Upload PDF/EPUB'}
        </Button>
      </Upload>

      <h2 style={{ marginTop: '20px' }}>Uploaded Books</h2>
      {books.length === 0 ? (
        <p>No books uploaded yet.</p>
      ) : (
        <Row gutter={[16, 16]}>
          {books.map((book) => (
            <Col key={book.id} xs={24} sm={12} md={8} lg={6}>
              <Card
                onClick={() => navigate('/reader/' + book.id)}
                hoverable
                cover={
                  <img
                    alt='placeholder'
                    src='https://via.placeholder.com/150'
                  />
                }
              >
                <Card.Meta title={book.title} description={book.title} />
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </div>
  );
};

export default LibraryPage;

// Helper functions with types
async function processOutline(
  outlineItems: OutlineItem[],
  pdf: PDFDocumentProxy
): Promise<Chapter[]> {
  const chapters: Chapter[] = [];
  for (let i = 0; i < outlineItems.length; i++) {
    console.log('Processing outline item', i);
    console.log(chapters);
    const item = outlineItems[i];
    const chapter = await processOutlineItem(item, pdf);
    chapters.push(chapter);
  }
  return chapters;
}

async function processOutlineItem(
  item: OutlineItem,
  pdf: PDFDocumentProxy
): Promise<Chapter> {
  const { title, dest, items } = item;

  // Get start page number
  let startPageNumber = 1;
  if (dest) {
    const destArray = await pdf.getDestination(dest);
    if (destArray) {
      const pageIndex = (destArray[0] as PDFPageProxy)._pageIndex + 1; // Pages are 1-based
      startPageNumber = pageIndex;
    }
  }

  // Get end page number
  let endPageNumber = pdf.numPages;
  if (items && items.length > 0) {
    // If there are sub-items, the end page is before the next sub-item
    const nextItem = items[0];
    const nextChapterStartPage = await getPageNumberFromDest(
      nextItem.dest,
      pdf
    );
    endPageNumber = nextChapterStartPage - 1;
  }

  // Extract text for this chapter
  const textContent = await extractTextFromPages(
    pdf,
    startPageNumber,
    endPageNumber
  );

  // Split text into passages
  const passages = splitTextIntoPassages(textContent);

  const chapter: Chapter = {
    title: title || `Chapter ${startPageNumber}`,
    order: startPageNumber,
    passages,
  };

  // Process sub-items (sub-chapters) recursively if needed
  if (items && items.length > 0) {
    chapter.subChapters = await processOutline(items, pdf);
  }

  return chapter;
}

async function getPageNumberFromDest(
  dest: string | string[] | null,
  pdf: PDFDocumentProxy
): Promise<number> {
  if (!dest) return pdf.numPages;
  //@ts-ignore
  const destArray = await pdf.getDestination(dest);
  if (destArray) {
    const pageIndex = (destArray[0] as PDFPageProxy)._pageIndex + 1; // Pages are 1-based
    return pageIndex;
  }
  return pdf.numPages;
}

async function extractTextFromPages(
  pdf: PDFDocumentProxy,
  startPage: number,
  endPage: number
): Promise<string> {
  let textContent = '';
  for (let i = startPage; i <= endPage; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    //@ts-ignore
    const strings = content.items.map((item) => (item as any).str);
    textContent += strings.join(' ') + '\n\n';
  }
  return textContent;
}

function splitTextIntoPassages(textContent: string): Passage[] {
  // Split text into passages (e.g., paragraphs)
  const passages = textContent
    .split('\n\n')
    .map((text) => text.trim())
    .filter(Boolean);
  return passages.map((text, index) => ({
    textContent: text,
    order: index + 1,
  }));
}
