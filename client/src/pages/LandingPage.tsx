import { DiscordOutlined, DownloadOutlined } from '@ant-design/icons';
import { useIsAuthenticated, useMsal } from '@azure/msal-react';
import {
  Button,
  Carousel,
  Col,
  Image,
  Layout,
  Rate,
  Row,
  Space,
  Typography,
} from 'antd';
import React from 'react';
import { useNavigate } from 'react-router-dom';

import { b2cPolicies, loginRequest } from '../utils/authConfig';

const { Title, Paragraph } = Typography;
const { Header, Content, Footer } = Layout;

const contentStyle: React.CSSProperties = {
  height: '400px',
  color: '#fff',
  lineHeight: '400px',
  textAlign: 'center',
  background: '#364d79',
};

const testimonials = [
  {
    name: 'Jane Doe',
    feedback:
      'Library Escape transformed the way I read. The AI annotations are a game-changer!',
    rating: 5,
    avatar: 'https://via.placeholder.com/100.png?text=Jane',
  },
  {
    name: 'John Smith',
    feedback:
      'Visualizing scenes made reading so much more engaging. Highly recommend!',
    rating: 4,
    avatar: 'https://via.placeholder.com/100.png?text=John',
  },
  // Add more testimonials as needed
];

const LandingPage: React.FC = () => {
  const { instance } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (isAuthenticated) navigate('/');
  }, [isAuthenticated, navigate]);

  const handleLogin = () => {
    instance
      .loginPopup({
        ...loginRequest,
        authority: b2cPolicies.authorities.signUpSignIn.authority,
      })
      .then((res: any) => {
        localStorage.setItem('accessToken', res.accessToken);
      })
      .catch((e) => {
        console.error('Authentication error:', e);
      });
  };
  const carouselHeight = 600; // Height for carousel and images

  const contentStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: carouselHeight,
    overflow: 'hidden',
  };
  const imgStyle: any = {
    maxHeight: '100%',
    height: carouselHeight,
    maxWidth: '100%',
    objectFit: 'contain', // Scales image proportionally within the container
    margin: '0 auto', // Centers image horizontally
  };
  return (
    <Layout>
      <Header style={{ padding: '0 50px' }}>
        <div className='logo' />
        <Title
          level={3}
          style={{
            float: 'left',
            margin: '16px 24px 16px 0',
            color: '#1890ff',
          }}
        >
          Library Escape
        </Title>
        <Button
          type='primary'
          onClick={handleLogin}
          style={{ float: 'right', marginTop: '15px' }}
        >
          Get Started
        </Button>
      </Header>

      <Content style={{ padding: '0 50px' }}>
        {/* Hero Section */}
        <div
          style={{
            // background: '#f0f2f5',
            padding: '50px 0',
          }}
        >
          <Row gutter={[16, 16]} align='middle'>
            <Col xs={24} md={12}>
              <Title>Experience Reading Like Never Before</Title>
              <Paragraph>
                Upload your EPUBs and let our AI transform your reading journey.
                Visualize scenes, interact with characters, and dive deeper into
                your favorite novels with immersive annotations powered by GPT.
              </Paragraph>
              <Space>
                <Button type='primary' size='large' onClick={handleLogin}>
                  Get Started
                </Button>
                <Button href='https://discord.gg/9gSKPA3x' size='large'>
                  <DiscordOutlined /> Join the Community!
                </Button>
              </Space>
            </Col>
            <Col xs={24} md={12}>
              <Image
                src='https://novelscapestorage.blob.core.windows.net/images/rand_logo123.png'
                alt='App Preview 1'
                // bordered
              />
            </Col>
          </Row>
        </div>

        {/* Slideshow Section */}
        <div style={{ padding: '50px 0' }}>
          <Title level={2} style={{ textAlign: 'center' }}>
            Example Passages
          </Title>
          <Carousel
            autoplay
            arrows
            draggable
            style={{ height: carouselHeight }}
          >
            <div style={contentStyle}>
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <img
                  src='https://novelscapestorage.blob.core.windows.net/images/passage_1_2024-10-11T00-33-12-163Z.png'
                  alt='Immersive Reading'
                  style={imgStyle}
                />
              </div>
            </div>
            <div style={contentStyle}>
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <img
                  src='https://novelscapestorage.blob.core.windows.net/images/passage_10_2024-10-25T17-49-43-031Z.png'
                  alt='Immersive Reading'
                  style={imgStyle}
                />
              </div>
            </div>
            <div style={contentStyle}>
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <img
                  src='https://novelscapestorage.blob.core.windows.net/images/passage_4.png'
                  alt='Upload Content'
                  style={imgStyle}
                />
              </div>
            </div>
            <div style={contentStyle}>
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <img
                  src='https://novelscapestorage.blob.core.windows.net/images/passage_5.png'
                  alt='AI Processing'
                  style={imgStyle}
                />
              </div>
            </div>
            <div style={contentStyle}>
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <img
                  src='https://novelscapestorage.blob.core.windows.net/images/passage_6.png'
                  alt='Visual Annotations'
                  style={imgStyle}
                />
              </div>
            </div>
          </Carousel>
        </div>

        {/* Features Section */}
        <div
          style={{
            // background: '#f0f2f5',
            padding: '50px 0',
          }}
        >
          <Title level={2} style={{ textAlign: 'center' }}>
            Key Features
          </Title>
          <Row gutter={[16, 16]} justify='center'>
            <Col xs={24} md={8}>
              <Image
                src='https://novelscapestorage.blob.core.windows.net/images/coming-soon-2550190_640.jpg'
                alt='AI Reading'
                width='100%'
                preview={false}
              />
              <Title level={4}>AI-Powered Reading</Title>
              <Paragraph>
                Let AI read your books aloud and provide real-time annotations
                to enhance your understanding and engagement.
              </Paragraph>
            </Col>
            <Col xs={24} md={8}>
              <Image
                src='https://novelscapestorage.blob.core.windows.net/images/passage_8_2024-10-25T19-44-59-625Z.png'
                alt='Scene Rendering'
                width='100%'
                preview={false}
              />
              <Title level={4}>Scene Rendering</Title>
              <Paragraph>
                Visualize scenes and characters as you read, making your reading
                experience more vivid and immersive.
              </Paragraph>
            </Col>
            <Col xs={24} md={8}>
              <Image
                src='https://novelscapestorage.blob.core.windows.net/images/coming-soon-2550190_640.jpg'
                alt='Cross-Platform'
                width='100%'
                preview={false}
              />
              <Title level={4}>Cross-Platform</Title>
              <Paragraph>
                Access your library anytime, anywhere on Web, iOS, and Android
                devices seamlessly.
              </Paragraph>
            </Col>
          </Row>
        </div>

        {/* Testimonials Section */}
        <div style={{ padding: '50px 0' }}>
          <Title level={2} style={{ textAlign: 'center' }}>
            What Our Users Say
          </Title>
          <Row gutter={[16, 16]} justify='center'>
            {testimonials.map((testimonial, index) => (
              <Col xs={24} md={8} key={index}>
                <div
                  style={{
                    textAlign: 'center',
                    padding: '20px',
                    // background: '#fafafa',
                    borderRadius: '8px',
                  }}
                >
                  <Image
                    src={testimonial.avatar}
                    alt={testimonial.name}
                    width={100}
                    height={100}
                    style={{ borderRadius: '50%' }}
                    preview={false}
                  />
                  <Title level={4} style={{ marginTop: '20px' }}>
                    {testimonial.name}
                  </Title>
                  <Rate disabled defaultValue={testimonial.rating} />
                  <Paragraph>"{testimonial.feedback}"</Paragraph>
                </div>
              </Col>
            ))}
          </Row>
        </div>

        {/* Call to Action */}
        <div style={{ padding: '50px 0', textAlign: 'center' }}>
          <Title level={2}>Ready to Transform Your Reading Experience?</Title>
          <Space size='large'>
            <Button type='primary' size='large' onClick={handleLogin}>
              Get Started
            </Button>
            <Button size='large'>
              <DownloadOutlined /> Download
            </Button>
          </Space>
        </div>
      </Content>

      {/* Footer */}
      <Footer style={{ textAlign: 'center' }}>
        In the pages of books lie the keys to realms unknown, where every word
        is a gateway to adventure and wonder. Begin your journey, for the story
        awaits.
      </Footer>
    </Layout>
  );
};

export default LandingPage;
