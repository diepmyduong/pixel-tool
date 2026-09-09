import { useState } from 'react'
import { Alert, Button, Card, Input, Modal, Progress, Select, Space, Tag, message } from 'antd'
import { DownloadOutlined, EditOutlined, ScissorOutlined, StopOutlined, VideoCameraOutlined } from '@ant-design/icons'
import type { Direction8 } from '../../types'
import { DIRECTION8_ORDER } from '../../types'
import type { Character2Sheet, Character2Pose, VideoCellKey } from './useCharacter2Sheet'
import { POSE_ORDER } from './useCharacter2Sheet'
import Character2CutFramesModal from './Character2CutFramesModal'

const { TextArea } = Input

const DIRECTION_OPTIONS = DIRECTION8_ORDER.map((d) => ({ value: d, label: d }))

const POSE_COLOR: Record<Character2Pose, string> = {
  stand: 'blue',
  run: 'green',
  attack: 'volcano',
}

interface DirectionVideosCardProps {
  sheet: Character2Sheet
}

/** Full-width card: one row per direction, each with stand/run/attack reference thumbnails and their generated videos. */
export default function DirectionVideosCard({ sheet }: DirectionVideosCardProps) {
  const {
    grid,
    sliced,
    rowDirections,
    setRowDirections,
    canvasForPose,
    videoCellState,
    generatingAll,
    zippingAll,
    cutTarget,
    setCutTarget,
    setPickerTarget,
    stopVideoForCell,
    generateVideoForCell,
    handleGenerateAllVideos,
    handleDownloadAllZip,
    getEffectivePrompt,
    setCustomPrompt,
    resetCustomPrompt,
    customPrompts,
  } = sheet

  // Which (row, pose) cell's prompt is being edited, plus a draft buffer so
  // typing doesn't commit a change until Save is pressed.
  const [promptTarget, setPromptTarget] = useState<{ row: number; pose: Character2Pose } | null>(null)
  const [promptDraft, setPromptDraft] = useState('')

  if (!sliced) return null

  function openPromptEditor(row: number, pose: Character2Pose) {
    setPromptDraft(getEffectivePrompt(row, pose))
    setPromptTarget({ row, pose })
  }

  function handleSavePrompt() {
    if (!promptTarget) return
    setCustomPrompt(promptTarget.row, promptTarget.pose, promptDraft)
    setPromptTarget(null)
    message.success('Prompt updated for this cell')
  }

  function handleResetPrompt() {
    if (!promptTarget) return
    resetCustomPrompt(promptTarget.row, promptTarget.pose)
    setPromptTarget(null)
  }

  return (
    <>
      <Card
        title="Stand / Run / Attack per direction — click a thumbnail to pick a different cell from the whole sheet"
        extra={
          <Space>
            <Button size="small" icon={<VideoCameraOutlined />} loading={generatingAll} onClick={handleGenerateAllVideos}>
              Generate all videos
            </Button>
            <Button size="small" icon={<DownloadOutlined />} loading={zippingAll} onClick={handleDownloadAllZip}>
              Download all (.zip)
            </Button>
          </Space>
        }
      >
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          {Array.from({ length: grid.rows }, (_, row) => (
            <div key={row} style={{ display: 'flex', gap: 24 }}>
              <Space align="start">
                <Select
                  style={{ width: 140 }}
                  value={rowDirections[row]}
                  options={DIRECTION_OPTIONS}
                  onChange={(value: Direction8) => setRowDirections((prev) => ({ ...prev, [row]: value }))}
                />
                {POSE_ORDER.map((pose) => {
                  const canvas = canvasForPose(row, pose)
                  return (
                    <div key={pose} style={{ textAlign: 'center', width: 140 }}>
                      <img
                        onClick={() => setPickerTarget({ row, pose })}
                        src={canvas?.toDataURL('image/png')}
                        alt={pose}
                        style={{
                          width: 72,
                          height: 72,
                          objectFit: 'contain',
                          background: '#eee',
                          cursor: 'pointer',
                          border: `2px solid ${
                            { blue: '#1677ff', green: '#52c41a', volcano: '#fa541c' }[POSE_COLOR[pose]]
                          }`,
                        }}
                      />
                      <div>
                        <Tag color={POSE_COLOR[pose]}>{pose}</Tag>
                      </div>
                    </div>
                  )
                })}
              </Space>

              <Space size="middle" style={{ flex: 1 }} align="start">
                {POSE_ORDER.map((pose) => {
                  const videoState = videoCellState(row, pose)
                  const key: VideoCellKey = `${row}-${pose}`
                  const direction = rowDirections[row]
                  return (
                    <div key={pose} style={{ width: 533 }}>
                      <Space wrap>
                        <Button
                          size="small"
                          icon={<VideoCameraOutlined />}
                          loading={videoState.status === 'generating'}
                          onClick={() => generateVideoForCell(row, pose)}
                        >
                          {videoState.status === 'done' || videoState.status === 'error'
                            ? `Regenerate ${pose} video`
                            : `Generate ${pose} video`}
                        </Button>
                        {videoState.status === 'generating' && (
                          <Button size="small" danger icon={<StopOutlined />} onClick={() => stopVideoForCell(row, pose)}>
                            Stop
                          </Button>
                        )}
                        <Button size="small" icon={<EditOutlined />} onClick={() => openPromptEditor(row, pose)}>
                          Edit prompt{customPrompts[key] !== undefined ? ' *' : ''}
                        </Button>
                        {videoState.videoUrl && (
                          <Button
                            size="small"
                            icon={<ScissorOutlined />}
                            onClick={() => setCutTarget({ key, url: videoState.videoUrl!, title: `${direction}-${pose}` })}
                          >
                            Cut {pose} frames
                          </Button>
                        )}
                      </Space>
                      {videoState.status === 'generating' && videoState.progress && (
                        <Progress
                          percent={videoState.progress.progress}
                          status="active"
                          size="small"
                          format={() => videoState.progress!.status}
                        />
                      )}
                      {videoState.status === 'error' && videoState.error && (
                        <Alert type="error" message={videoState.error} style={{ marginTop: 4, textAlign: 'left' }} />
                      )}
                      {videoState.videoUrl && (
                        <video
                          src={videoState.videoUrl}
                          controls
                          loop
                          style={{ width: '100%', marginTop: 4, background: '#000' }}
                        />
                      )}
                    </div>
                  )
                })}
              </Space>
            </div>
          ))}
        </Space>
      </Card>

      {cutTarget && (
        <Character2CutFramesModal
          open
          videoUrl={cutTarget.url}
          title={cutTarget.title}
          onClose={() => setCutTarget(null)}
        />
      )}

      <Modal
        title={promptTarget ? `Edit prompt — ${rowDirections[promptTarget.row]}-${promptTarget.pose}` : ''}
        open={promptTarget !== null}
        onCancel={() => setPromptTarget(null)}
        width={720}
        footer={[
          <Button key="reset" onClick={handleResetPrompt}>
            Reset to auto-generated
          </Button>,
          <Button key="save" type="primary" onClick={handleSavePrompt}>
            Save
          </Button>,
        ]}
      >
        <TextArea
          value={promptDraft}
          onChange={(e) => setPromptDraft(e.target.value)}
          rows={16}
          style={{ fontFamily: 'monospace', fontSize: 12 }}
        />
      </Modal>
    </>
  )
}
