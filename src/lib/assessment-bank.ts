import { allSubtopics, cfaLevel1Syllabus } from '@/lib/cfa-data'

export type AssessmentScope = 'topic_quiz' | 'subject_quiz' | 'chapter_quiz' | 'full_mock'

export type BankQuestion = {
  prompt: string
  options: string[]
  correctIndex: number
  rationale: string
  tags?: string[]
}

export type AssessmentSet = {
  id: string
  source: 'admin_upload' | 'generated'
  scope: AssessmentScope
  title: string
  subjectId: string | null
  subjectTitle: string | null
  topicId: string | null
  topicTitle: string | null
  subtopicId: string | null
  subtopicTitle: string | null
  createdAt: string
}

export const assessmentScopeLabels: Record<AssessmentScope, string> = {
  topic_quiz: 'Customised topic quiz',
  subject_quiz: 'Chapter quiz',
  chapter_quiz: 'Topic quiz',
  full_mock: 'Full mock',
}

export const assessmentScopeOptions = [
  { value: 'topic_quiz', label: 'Customised topic quiz' },
  { value: 'chapter_quiz', label: 'Topic quiz' },
  { value: 'subject_quiz', label: 'Chapter quiz' },
  { value: 'full_mock', label: 'Full mock' },
] satisfies Array<{ value: AssessmentScope; label: string }>

export function normalizeQuestion(question: BankQuestion): BankQuestion | null {
  const options = Array.isArray(question.options) ? question.options.map((option) => String(option).trim()).filter(Boolean) : []
  const correctIndex = Number(question.correctIndex)

  if (!question.prompt?.trim() || options.length < 2 || !Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length) {
    return null
  }

  return {
    prompt: question.prompt.trim(),
    options,
    correctIndex,
    rationale: question.rationale?.trim() || 'Review the core rule and why the other options fail.',
    tags: question.tags ?? [],
  }
}

export function normalizeQuestions(questions: BankQuestion[]) {
  const seen = new Set<string>()
  return questions
    .map(normalizeQuestion)
    .filter((question): question is BankQuestion => Boolean(question))
    .filter((question) => {
      const key = question.prompt.toLowerCase().replace(/\s+/g, ' ')
      if (seen.has(key)) {
        return false
      }
      seen.add(key)
      return true
    })
}

export function parseQuestionJson(value: string) {
  try {
    const parsed = JSON.parse(value) as { questions?: BankQuestion[] } | BankQuestion[]
    return normalizeQuestions(Array.isArray(parsed) ? parsed : parsed.questions ?? [])
  } catch {
    return []
  }
}

export function getDefaultAssessmentTarget(scope: AssessmentScope) {
  const firstSubject = cfaLevel1Syllabus[0]
  const firstTopic = firstSubject?.topics[0]
  const firstSubtopic = allSubtopics[0]

  if (scope === 'full_mock') {
    return {
      subjectId: null,
      subjectTitle: null,
      topicId: null,
      topicTitle: null,
      subtopicId: null,
      subtopicTitle: null,
      title: 'Full CFA Level I mock',
    }
  }

  if (scope === 'subject_quiz') {
    return {
      subjectId: firstSubject?.id ?? null,
      subjectTitle: firstSubject?.title ?? null,
      topicId: null,
      topicTitle: null,
      subtopicId: null,
      subtopicTitle: null,
      title: firstSubject?.title ?? 'Chapter quiz',
    }
  }

  if (scope === 'chapter_quiz') {
    return {
      subjectId: firstSubject?.id ?? null,
      subjectTitle: firstSubject?.title ?? null,
      topicId: firstTopic?.id ?? null,
      topicTitle: firstTopic?.title ?? null,
      subtopicId: null,
      subtopicTitle: null,
      title: firstTopic?.title ?? 'Chapter quiz',
    }
  }

  return {
    subjectId: firstSubtopic?.subject.id ?? null,
    subjectTitle: firstSubtopic?.subject.title ?? null,
    topicId: firstSubtopic?.topic.id ?? null,
    topicTitle: firstSubtopic?.topic.title ?? null,
    subtopicId: firstSubtopic?.id ?? null,
    subtopicTitle: firstSubtopic?.title ?? null,
    title: firstSubtopic?.title ?? 'Topic quiz',
  }
}

export function buildTargetFromIds(scope: AssessmentScope, targetId: string) {
  if (scope === 'full_mock') {
    return getDefaultAssessmentTarget(scope)
  }

  if (scope === 'subject_quiz') {
    const subject = cfaLevel1Syllabus.find((item) => item.id === targetId)
    if (subject) {
      return {
        subjectId: subject.id,
        subjectTitle: subject.title,
        topicId: null,
        topicTitle: null,
        subtopicId: null,
        subtopicTitle: null,
        title: subject.title,
      }
    }
  }

  if (scope === 'chapter_quiz') {
    for (const subject of cfaLevel1Syllabus) {
      const topic = subject.topics.find((item) => item.id === targetId)
      if (topic) {
        return {
          subjectId: subject.id,
          subjectTitle: subject.title,
          topicId: topic.id,
          topicTitle: topic.title,
          subtopicId: null,
          subtopicTitle: null,
          title: topic.title,
        }
      }
    }
  }

  const subtopic = allSubtopics.find((item) => item.id === targetId)
  if (subtopic) {
    return {
      subjectId: subtopic.subject.id,
      subjectTitle: subtopic.subject.title,
      topicId: subtopic.topic.id,
      topicTitle: subtopic.topic.title,
      subtopicId: subtopic.id,
      subtopicTitle: subtopic.title,
      title: subtopic.title,
    }
  }

  return getDefaultAssessmentTarget(scope)
}

export function mapAssessmentSet(row: Record<string, unknown>): AssessmentSet {
  return {
    id: String(row.id),
    source: row.source as AssessmentSet['source'],
    scope: row.scope as AssessmentScope,
    title: String(row.title ?? ''),
    subjectId: typeof row.subject_id === 'string' ? row.subject_id : null,
    subjectTitle: typeof row.subject_title === 'string' ? row.subject_title : null,
    topicId: typeof row.topic_id === 'string' ? row.topic_id : null,
    topicTitle: typeof row.topic_title === 'string' ? row.topic_title : null,
    subtopicId: typeof row.subtopic_id === 'string' ? row.subtopic_id : null,
    subtopicTitle: typeof row.subtopic_title === 'string' ? row.subtopic_title : null,
    createdAt: String(row.created_at ?? ''),
  }
}
