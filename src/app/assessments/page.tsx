'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { BrainCircuit, CheckCircle2, FileCheck2, LoaderCircle, RotateCcw, Target } from 'lucide-react'
import { assessmentScopeLabels, buildTargetFromIds, mapAssessmentSet, type AssessmentScope, type AssessmentSet } from '@/lib/assessment-bank'
import { cfaLevel1Syllabus } from '@/lib/cfa-data'
import {
  buildQuestionAttempts,
  fetchRemoteQuestionAttempts,
  getReviewQuestionsForSubtopic,
  insertRemoteQuestionAttempts,
  loadQuestionAttempts,
  mergeQuestionAttempts,
  saveQuestionAttempts,
  type QuestionAttempt,
} from '@/lib/question-attempts'
import { useStudyWorkspace } from '@/lib/study-engine'
import { createClient } from '@/lib/supabase/browser'

type QuizQuestion = {
  prompt: string
  options: string[]
  correctIndex: number
  rationale: string
}

const readinessOptions = [
  { value: '1', label: 'Not ready at all' },
  { value: '2', label: 'A bit shaky' },
  { value: '3', label: 'Somewhat ready' },
  { value: '4', label: 'Pretty ready' },
  { value: '5', label: 'Very ready' },
]

export default function AssessmentsPage() {
  const workspace = useStudyWorkspace()
  const [supabase] = useState(() => createClient())
  const [selectedSubtopicId, setSelectedSubtopicId] = useState(workspace.enrichedSubtopics[0]?.id ?? '')
  const [scope, setScope] = useState<AssessmentScope>('topic_quiz')
  const [chapterTargetId, setChapterTargetId] = useState(cfaLevel1Syllabus[0]?.topics[0]?.id ?? '')
  const [availableSets, setAvailableSets] = useState<AssessmentSet[]>([])
  const [selectedSetId, setSelectedSetId] = useState('')
  const [activeSetId, setActiveSetId] = useState<string | null>(null)
  const [activeSource, setActiveSource] = useState<string | null>(null)
  const [confidence, setConfidence] = useState('3')
  const [quiz, setQuiz] = useState<QuizQuestion[]>([])
  const [answers, setAnswers] = useState<number[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [questionAttempts, setQuestionAttempts] = useState<QuestionAttempt[]>(() => loadQuestionAttempts())
  const [reviewCount, setReviewCount] = useState(0)

  const selectedSubtopic = useMemo(
    () => workspace.enrichedSubtopics.find((item) => item.id === selectedSubtopicId) ?? workspace.enrichedSubtopics[0],
    [selectedSubtopicId, workspace.enrichedSubtopics],
  )
  const selectedChapter = useMemo(
    () => cfaLevel1Syllabus.flatMap((subject) => subject.topics.map((topic) => ({ ...topic, subject }))).find((topic) => topic.id === chapterTargetId),
    [chapterTargetId],
  )
  const activeTarget = buildTargetFromIds(scope, scope === 'chapter_quiz' ? chapterTargetId : selectedSubtopicId)

  const latestForTopic = selectedSubtopic
    ? workspace.assessments.find((assessment) => assessment.subtopicId === selectedSubtopic.id) ?? null
    : null

  const averageScore =
    workspace.assessments.length > 0
      ? Math.round(workspace.assessments.reduce((sum, item) => sum + item.scorePercentage, 0) / workspace.assessments.length)
      : 0

  const answeredCount = answers.filter((answer) => answer >= 0).length
  const canSubmit = quiz.length > 0 && answeredCount === quiz.length && !submitted

  useEffect(() => {
    let active = true

    async function loadSets() {
      const { data } = await supabase
        .from('assessment_sets')
        .select('id, source, scope, title, subject_id, subject_title, topic_id, topic_title, subtopic_id, subtopic_title, created_at')
        .eq('published', true)
        .order('created_at', { ascending: false })
        .limit(50)

      if (!active) {
        return
      }

      const sets = (data ?? []).map((row) => mapAssessmentSet(row))
      setAvailableSets(sets)
      setSelectedSetId((current) => current || sets[0]?.id || '')
    }

    loadSets()

    return () => {
      active = false
    }
  }, [supabase])

  async function generateQuiz() {
    if (!selectedSubtopic) {
      return
    }

    setIsLoading(true)
    setSubmitted(false)

    try {
      const localAttempts = loadQuestionAttempts()
      let mergedAttempts = localAttempts
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        try {
          const remoteAttempts = await fetchRemoteQuestionAttempts(supabase, user.id, selectedSubtopic.id)
          mergedAttempts = mergeQuestionAttempts(localAttempts, remoteAttempts)
          saveQuestionAttempts(mergedAttempts)
          setQuestionAttempts(mergedAttempts)
        } catch {
          mergedAttempts = localAttempts
        }
      }

      const attemptTargetId = scope === 'topic_quiz' ? selectedSubtopic.id : scope === 'chapter_quiz' ? chapterTargetId : 'full_mock'
      const reviewQuestions = getReviewQuestionsForSubtopic(mergedAttempts, attemptTargetId, 2)
      setReviewCount(reviewQuestions.length)
      const target = buildTargetFromIds(scope, attemptTargetId)

      const response = await fetch('/api/assessments/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          topic: target.topicTitle ?? target.subjectTitle ?? 'CFA Level I',
          subtopic: target.subtopicTitle ?? target.topicTitle ?? 'Full curriculum',
          mode: scope,
          scope,
          targetId: attemptTargetId,
          reviewQuestions,
        }),
      })

      const data = (await response.json()) as { questions?: QuizQuestion[]; setId?: string; source?: string }
      const questions = data.questions ?? []
      setQuiz(questions)
      setActiveSetId(data.setId ?? null)
      setActiveSource(data.source ?? 'generated')
      setAnswers(new Array(questions.length).fill(-1))
    } finally {
      setIsLoading(false)
    }
  }

  async function startUploadedSet() {
    if (!selectedSetId) {
      return
    }

    setIsLoading(true)
    setSubmitted(false)

    try {
      const { data } = await supabase
        .from('assessment_questions')
        .select('prompt, options, correct_index, rationale')
        .eq('set_id', selectedSetId)
        .order('ordinal', { ascending: true })

      const questions = (data ?? []).map((row) => ({
        prompt: row.prompt,
        options: Array.isArray(row.options) ? row.options : [],
        correctIndex: row.correct_index,
        rationale: row.rationale ?? '',
      }))

      const selectedSet = availableSets.find((set) => set.id === selectedSetId)
      setScope(selectedSet?.scope ?? scope)
      setQuiz(questions)
      setActiveSetId(selectedSetId)
      setActiveSource(selectedSet?.source ?? 'admin_upload')
      setReviewCount(0)
      setAnswers(new Array(questions.length).fill(-1))
    } finally {
      setIsLoading(false)
    }
  }

  async function submitQuiz() {
    if (!selectedSubtopic || !canSubmit) {
      return
    }

    const correct = quiz.filter((question, index) => question.correctIndex === answers[index]).length
    const scorePercentage = Math.round((correct / quiz.length) * 100)
    const aiMastery = Number(((scorePercentage / 100) * 5).toFixed(1))

    const wrongCount = quiz.length - correct
    const errorCategories =
      wrongCount === 0
        ? ['stable understanding']
        : wrongCount === 1
          ? ['memory lapse']
          : wrongCount === 2
            ? ['weak retention', 'careless error']
            : ['conceptual misunderstanding', 'weak retention']

    const attemptTargetId = scope === 'topic_quiz' ? selectedSubtopic.id : scope === 'chapter_quiz' ? chapterTargetId : 'full_mock'
    const target = buildTargetFromIds(scope, attemptTargetId)

    workspace.saveAssessment({
      subtopicId: attemptTargetId,
      mode: 'topic_quiz',
      scorePercentage,
      aiMastery,
      confidenceAtAttempt: Number(confidence),
      questionCount: quiz.length,
      errorCategories,
      explanationSummary:
        scorePercentage >= 75
          ? 'You look solid here. Keep this in normal revision.'
          : scorePercentage >= 50
            ? 'You are part-way there. Review this topic once more before moving on.'
            : 'This topic still needs work. Relearn it, then retest quickly.',
      recommendedAction:
        scorePercentage >= 75 ? 'Move on and revisit later.' : scorePercentage >= 50 ? 'Do a short review tomorrow.' : 'Flag this topic and review it now.',
    })

    const attempts = buildQuestionAttempts({
      subtopicId: attemptTargetId,
      assessmentSetId: activeSetId,
      scope,
      source: activeSource,
      topic: target.topicTitle ?? target.subjectTitle ?? 'CFA Level I',
      subtopic: target.subtopicTitle ?? target.topicTitle ?? 'Full curriculum',
      questions: quiz,
      answers,
    })
    const nextAttempts = mergeQuestionAttempts(attempts, questionAttempts)
    setQuestionAttempts(nextAttempts)
    saveQuestionAttempts(nextAttempts)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (user) {
      try {
        await insertRemoteQuestionAttempts(supabase, user.id, attempts)
      } catch {
        // Local attempt storage still keeps the mistake bank available.
      }
    }

    setSubmitted(true)
  }

  const currentResult =
    submitted && quiz.length > 0
      ? {
          correct: quiz.filter((question, index) => question.correctIndex === answers[index]).length,
          total: quiz.length,
        }
      : null

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: 'easeOut' }} className="space-y-8">
      <div>
        <h1 className="text-4xl font-semibold tracking-tight text-slate-900">Test Yourself</h1>
        <p className="mt-2 text-lg text-slate-600">
          Pick one study item, answer a few questions, then get one clear summary of how you did and what to do next.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="soft-panel rounded-[1.75rem] p-5">
          <p className="text-sm text-slate-500">Quizzes taken</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{workspace.assessments.length}</p>
        </div>
        <div className="soft-panel rounded-[1.75rem] p-5">
          <p className="text-sm text-slate-500">Average quiz score</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{averageScore}%</p>
        </div>
        <div className="soft-panel rounded-[1.75rem] p-5">
          <p className="text-sm text-slate-500">Topics needing review</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{workspace.flaggedCount}</p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <div className="soft-panel rounded-[2rem] p-6">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
            <BrainCircuit className="text-pink-500" size={18} />
            Quiz setup
          </h2>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Quiz type</span>
              <select
                value={scope}
                onChange={(event) => setScope(event.target.value as AssessmentScope)}
                className="app-select"
              >
                <option value="topic_quiz">Topic quiz</option>
                <option value="chapter_quiz">Chapter quiz</option>
                <option value="full_mock">Full mock</option>
              </select>
            </label>

            {scope === 'topic_quiz' ? (
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">What topic do you want to test?</span>
              <select
                value={selectedSubtopicId}
                onChange={(event) => setSelectedSubtopicId(event.target.value)}
                className="app-select"
              >
                {workspace.enrichedSubtopics.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.subject.title} · {item.title}
                  </option>
                ))}
              </select>
              </label>
            ) : null}

            {scope === 'chapter_quiz' ? (
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">Chapter</span>
                <select
                  value={chapterTargetId}
                  onChange={(event) => setChapterTargetId(event.target.value)}
                  className="app-select"
                >
                  {cfaLevel1Syllabus.flatMap((subject) =>
                    subject.topics.map((topic) => (
                      <option key={topic.id} value={topic.id}>
                        {subject.title} · {topic.title}
                      </option>
                    )),
                  )}
                </select>
              </label>
            ) : null}

            {scope === 'full_mock' ? (
              <div className="rounded-lg border border-pink-100 bg-pink-50/70 px-4 py-3 text-sm text-slate-600">
                Full mock mode mixes the curriculum and saves the whole generated paper.
              </div>
            ) : null}

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">How ready do you feel before the quiz?</span>
              <select
                value={confidence}
                onChange={(event) => setConfidence(event.target.value)}
                className="app-select"
              >
                {readinessOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <button
            type="button"
            onClick={generateQuiz}
            disabled={isLoading}
            className="mt-4 inline-flex items-center justify-center gap-2 rounded-2xl bg-pink-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-pink-200 transition-transform hover:-translate-y-0.5 disabled:opacity-70"
          >
            {isLoading ? <LoaderCircle size={16} className="animate-spin" /> : <FileCheck2 size={16} />}
            {isLoading ? 'Building quiz...' : 'Start quiz'}
          </button>

          <div className="mt-4 rounded-[1.5rem] border border-pink-100 bg-white/85 p-4">
            <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">Uploaded or saved paper</span>
                <select
                  value={selectedSetId}
                  onChange={(event) => setSelectedSetId(event.target.value)}
                  className="app-select"
                >
                  {availableSets.length === 0 ? <option value="">No saved papers yet</option> : null}
                  {availableSets.map((set) => (
                    <option key={set.id} value={set.id}>
                      {assessmentScopeLabels[set.scope]} · {set.title}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={startUploadedSet}
                disabled={!selectedSetId || isLoading}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-pink-200 bg-white px-4 py-3 text-sm font-semibold text-pink-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Load saved paper
              </button>
            </div>
          </div>

              {quiz.length > 0 ? (
            <div className="mt-6 space-y-4">
              <div className="rounded-[1.5rem] border border-pink-100 bg-pink-50/60 px-4 py-3 text-sm text-slate-600">
                Answer all {quiz.length} questions, then submit once. {activeSetId ? 'This paper is stored in the backend.' : 'This quiz will be stored once generated.'} {reviewCount > 0 ? `${reviewCount} missed ${reviewCount === 1 ? 'question is' : 'questions are'} back in this quiz.` : 'Missed questions will come back in later quizzes.'}
              </div>

              {quiz.map((question, questionIndex) => {
                const selectedAnswer = answers[questionIndex]
                const answeredCorrectly = submitted && selectedAnswer === question.correctIndex

                return (
                  <div key={questionIndex} className="rounded-[1.5rem] border border-pink-100 bg-white p-4">
                    <p className="font-medium text-slate-900">
                      {questionIndex + 1}. {question.prompt}
                    </p>
                    <div className="mt-3 space-y-2">
                      {question.options.map((option, optionIndex) => {
                        const isSelected = selectedAnswer === optionIndex
                        const isCorrect = submitted && question.correctIndex === optionIndex

                        return (
                          <label
                            key={optionIndex}
                            className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-sm ${
                              isCorrect
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                : isSelected && submitted
                                  ? 'border-rose-200 bg-rose-50 text-rose-700'
                                  : 'border-pink-100 bg-pink-50/50 text-slate-700'
                            }`}
                          >
                            <input
                              type="radio"
                              checked={isSelected}
                              onChange={() => {
                                if (submitted) {
                                  return
                                }

                                const nextAnswers = answers.slice()
                                nextAnswers[questionIndex] = optionIndex
                                setAnswers(nextAnswers)
                              }}
                              className="accent-pink-500"
                            />
                            {option}
                          </label>
                        )
                      })}
                    </div>

                    {submitted ? (
                      <div className={`mt-3 rounded-2xl border px-4 py-3 text-sm ${answeredCorrectly ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
                        <p className="font-semibold">{answeredCorrectly ? 'You got this right.' : `You missed this one. Correct answer: ${question.options[question.correctIndex]}`}</p>
                        <p className="mt-1">{question.rationale}</p>
                      </div>
                    ) : null}
                  </div>
                )
              })}

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={submitQuiz}
                  disabled={!canSubmit}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Target size={16} />
                  {canSubmit ? 'Submit answers' : `Answer all questions first (${answeredCount}/${quiz.length})`}
                </button>
                {submitted ? (
                  <button
                    type="button"
                    onClick={() => {
                      setQuiz([])
                      setAnswers([])
                      setSubmitted(false)
                    }}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-pink-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition-transform hover:-translate-y-0.5"
                  >
                    <RotateCcw size={16} />
                    New quiz
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <div className="space-y-6">
          <div className="soft-panel rounded-[2rem] p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
              <CheckCircle2 className="text-pink-500" size={18} />
              One-stop summary
            </h2>

            {currentResult ? (
              <div className="space-y-4">
                <div className="rounded-[1.5rem] border border-pink-100 bg-white p-5">
                  <p className="text-sm text-slate-500">Latest result</p>
                  <p className="mt-2 text-3xl font-semibold text-slate-900">
                    {currentResult.correct}/{currentResult.total} right
                  </p>
                  <p className="mt-1 text-sm text-slate-600">{Math.round((currentResult.correct / currentResult.total) * 100)}% score</p>
                </div>

                <div className="rounded-[1.5rem] border border-pink-100 bg-white p-5">
                  <p className="text-sm text-slate-500">What this means</p>
                  <p className="mt-2 text-base leading-7 text-slate-700">
                    {latestForTopic?.explanationSummary ?? 'Finish a quiz to see a plain-English summary here.'}
                  </p>
                </div>

                <div className="rounded-[1.5rem] border border-pink-100 bg-white p-5">
                  <p className="text-sm text-slate-500">Next step</p>
                  <p className="mt-2 text-base leading-7 text-slate-700">
                    {latestForTopic?.recommendedAction ?? 'Take a quiz to get a next-step recommendation.'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="rounded-[1.5rem] border border-dashed border-pink-200 bg-white/70 p-6 text-sm text-slate-600">
                Start a quiz and this panel will give one clear summary instead of a long history feed.
              </div>
            )}
          </div>

          <div className="soft-panel rounded-[2rem] p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
              <Target className="text-pink-500" size={18} />
              Current topic snapshot
            </h2>
            <div className="space-y-3">
              <div className="rounded-2xl border border-pink-100 bg-white px-4 py-4">
                <p className="font-medium text-slate-900">{activeTarget.title}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {assessmentScopeLabels[scope]} · {scope === 'chapter_quiz' ? selectedChapter?.subject.title : selectedSubtopic?.subject.title}
                </p>
              </div>

              <div className="rounded-2xl border border-pink-100 bg-white px-4 py-4">
                <p className="font-medium text-slate-900">Study feeling</p>
                <p className="mt-1 text-xs text-slate-500">
                  You currently marked this topic as {readinessOptions.find((option) => option.value === String(selectedSubtopic?.progress?.selfConfidence ?? 3))?.label.toLowerCase() ?? 'somewhat ready'}.
                </p>
              </div>

              <div className="rounded-2xl border border-pink-100 bg-white px-4 py-4">
                <p className="font-medium text-slate-900">Revision status</p>
                <p className="mt-1 text-xs text-slate-500">
                  {selectedSubtopic?.progress?.revisionDueAt ? 'This topic has a revision date scheduled.' : 'No revision date is scheduled yet for this topic.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
