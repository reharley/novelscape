import { Card, Col, Row, Spin, Typography } from 'antd';
import axios from 'axios';
import React, { useEffect, useState } from 'react';
import ProfileDetails from '../components/profiles/ProfileDetails';
import { apiUrl } from '../utils/general';

const { Meta } = Card;
const { Title } = Typography;

interface Profile {
  id: number;
  name: string;
  type: string;
  imageUrl?: string;
  gender?: string;
}

const ProfileListPage: React.FC = () => {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(
    null
  );
  const baseUrl = apiUrl + '/api';

  useEffect(() => {
    axios
      .get(baseUrl + '/profiles')
      .then((response) => {
        setProfiles(response.data);
        setLoading(false);
      })
      .catch((error) => {
        console.error('Error fetching profiles:', error);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <Spin size='large' />;
  }

  return (
    <>
      <Title level={2}>Profiles</Title>
      <Row gutter={[16, 16]}>
        {profiles.map((profile) => (
          <Col key={profile.id} xs={24} sm={12} md={8} lg={6}>
            <Card
              hoverable
              cover={
                <img
                  alt={profile.name}
                  src={profile.imageUrl || 'default-image.png'}
                />
              }
              onClick={() => setSelectedProfileId(profile.id)}
            >
              <Meta title={profile.name} description={profile.type} />
            </Card>
          </Col>
        ))}
      </Row>

      {selectedProfileId && (
        <ProfileDetails
          profileId={selectedProfileId}
          onClose={() => setSelectedProfileId(null)}
        />
      )}
    </>
  );
};

export default ProfileListPage;
