export type RecallFlashcard = {
  id: string
  subjectId: string
  subject: string
  topicId: string
  topic: string
  module: string
  kind: string
  front: string
  back: string
  hint: string
  tags: string[]
  source: { id: string; page: number; title: string }
}
