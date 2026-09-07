import { Layout, Menu, Typography } from 'antd'
import {
  AppstoreOutlined,
  PictureOutlined,
  UserOutlined,
  VideoCameraAddOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import CharactersPage from './routes/Characters/CharactersPage'
import Characters2Page from './routes/Characters2/Characters2Page'
import ItemsPage from './routes/Items/ItemsPage'
import AnimationsPage from './routes/Animations/AnimationsPage'
import AnimationsByImagePage from './routes/AnimationsByImage/AnimationsByImagePage'
import AnimationsVideoV2Page from './routes/AnimationsVideoV2/AnimationsVideoV2Page'

const { Sider, Content, Header } = Layout

const menuItems = [
  { key: '/characters', icon: <UserOutlined />, label: 'Characters' },
  { key: '/characters-2', icon: <UserOutlined />, label: 'Characters-2' },
  { key: '/items', icon: <AppstoreOutlined />, label: 'Items' },
  { key: '/animations', icon: <VideoCameraOutlined />, label: 'Animations (Video)' },
  { key: '/animations-by-image', icon: <PictureOutlined />, label: 'Animations (Image)' },
  { key: '/animations-video-v2', icon: <VideoCameraAddOutlined />, label: 'Animations (Video v2)' },
]

function App() {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <Layout style={{ height: '100%' }}>
      <Sider width={260} theme="light">
        <div style={{ padding: '16px 20px' }}>
          <Typography.Title level={4} style={{ margin: 0 }}>
            Sprite Dashboard
          </Typography.Title>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header style={{ background: '#fff', borderBottom: '1px solid #f0f0f0' }} />
        <Content style={{ padding: 24, overflow: 'auto' }}>
          <Routes>
            <Route path="/" element={<Navigate to="/characters" replace />} />
            <Route path="/characters" element={<CharactersPage />} />
            <Route path="/characters-2" element={<Characters2Page />} />
            <Route path="/items" element={<ItemsPage />} />
            <Route path="/animations" element={<AnimationsPage />} />
            <Route path="/animations-by-image" element={<AnimationsByImagePage />} />
            <Route path="/animations-video-v2" element={<AnimationsVideoV2Page />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  )
}

export default App
