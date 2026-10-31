import type { ExamQuestion } from '@/lib/learning-store'
import { normalizeMockExplanation } from '@/lib/mock-explanation'
import { InlineQuestionText } from './question-content'

export function MockQuestionExplanation({ question, submittedIndex }: { question: ExamQuestion; submittedIndex: number | null }) {
  const explanation = normalizeMockExplanation(question.explanation, question)
  if (!explanation) return <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
    <p className="text-xs font-bold text-blue-900">Source rationale</p>
    <p className="mt-2 text-sm leading-6 text-slate-700"><InlineQuestionText text={question.rationale || question.unscoredReason || 'No explanation was included with this question.'} /></p>
    {question.mockId ? <p className="mt-2 text-xs text-slate-500">A detailed option-by-option explanation is not available for this version of the question.</p> : null}
  </div>
  const verified = question.answerVerified !== false && question.correctIndex >= 0
  return <section aria-label="Intuitive answer explanation" className="mt-4 space-y-4 rounded-xl border border-blue-100 bg-white p-4 sm:p-5">
    <div><h3 className="text-base font-semibold text-blue-950">Understand the answer</h3><p className="mt-1 text-xs text-slate-500">AI-authored study explanation. Check source cautions where shown.</p></div>
    {explanation.caution ? <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950"><p className="font-bold">Source / answer-key caution</p><InlineQuestionText text={explanation.caution} /></div> : null}
    <div><h4 className="text-xs font-bold uppercase tracking-wide text-blue-800">The intuition</h4><p className="mt-1.5 whitespace-pre-line text-sm leading-7 text-slate-700"><InlineQuestionText text={explanation.intuition} /></p></div>
    <div><h4 className="text-xs font-bold uppercase tracking-wide text-blue-800">Work it through</h4><p className="mt-1.5 whitespace-pre-line text-sm leading-7 text-slate-700"><InlineQuestionText text={explanation.reasoning} /></p></div>
    <div className="space-y-3"><h4 className="text-xs font-bold uppercase tracking-wide text-blue-800">Why each option works or fails</h4>{explanation.options.map(option => <div key={option.index} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-sm font-semibold text-slate-900">{String.fromCharCode(65 + option.index)}. <InlineQuestionText text={question.options[option.index]} />{submittedIndex === option.index ? <span className="ml-2 text-xs text-blue-700">Your answer</span> : null}</p>
      <p className="mt-1 text-xs font-semibold text-slate-500">{verified ? option.index === question.correctIndex ? explanation.caution ? 'Source-key answer, see caution above' : 'Correct answer' : explanation.caution ? 'Alternative option, see caution above' : 'Incorrect option' : 'Unscored option'}</p>
      <p className="mt-1.5 whitespace-pre-line text-sm leading-7 text-slate-700"><InlineQuestionText text={option.explanation} /></p>
    </div>)}</div>
    {explanation.learningHack ? <div className="rounded-lg border border-violet-100 bg-violet-50 p-3"><h4 className="text-xs font-bold uppercase tracking-wide text-violet-800">Remember it</h4><p className="mt-1.5 whitespace-pre-line text-sm leading-7 text-slate-700"><InlineQuestionText text={explanation.learningHack} /></p></div> : null}
  </section>
}
