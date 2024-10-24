import { DownloadOutlined } from '@ant-design/icons';
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
      'ImmersiveReader transformed the way I read. The AI annotations are a game-changer!',
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
          ImmersiveReader
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
                <Button size='large'>
                  <DownloadOutlined /> Download
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
            How It Works
          </Title>
          <Carousel autoplay arrows draggable>
            <div>
              <Image
                src='https://via.placeholder.com/800x400.png?text=Upload+Your+Content'
                alt='Upload Content'
                width='100%'
              />
              <h3 style={contentStyle}>Upload Your Content</h3>
            </div>
            <div>
              <Image
                src='https://via.placeholder.com/800x400.png?text=AI+Processing'
                alt='AI Processing'
                width='100%'
              />
              <h3 style={contentStyle}>AI Processing</h3>
            </div>
            <div>
              <Image
                src='https://via.placeholder.com/800x400.png?text=Visual+Annotations'
                alt='Visual Annotations'
                width='100%'
              />
              <h3 style={contentStyle}>Visual Annotations</h3>
            </div>
            <div>
              <Image
                src='https://via.placeholder.com/800x400.png?text=Immersive+Reading'
                alt='Immersive Reading'
                width='100%'
              />
              <h3 style={contentStyle}>Immersive Reading</h3>
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
                src='https://via.placeholder.com/200.png?text=AI+Reading'
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
                src='https://via.placeholder.com/200.png?text=Scene+Rendering'
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
                src='https://via.placeholder.com/200.png?text=Cross-Platform'
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
