# Study Table

A low-friction CFA Level I practice workspace with three screens:

- **Track** (`/`): statistics from recorded interactions and completed attempts. No predicted readiness, study plans, revision recommendations, or manual progress forms. The optional syllabus shows platform engagement rather than claiming preparation completion.
- **Notes & Flashcards** (`/notes`): subject notes, downloadable study PDFs and flashcards. Opening, flipping and practising records activity automatically.
- **Mocks & Assessments** (`/mocks`): named question banks, quick practice, two-session Level I mocks, uploaded sets, on-demand AI questions, saved attempts and mistakes retrieval.

## Local development

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. The bundled library and practice bank work without an account. An account syncs activity and completed attempts to Supabase.

The intended Supabase project is `sacqjhcvnmnialtizdvz`. Keep credentials in ignored `.env.local`; the service-role key is not needed by this app. Never expose privileged keys as `NEXT_PUBLIC_` variables.

## Persistence

`learning_activity` and `exam_attempts` have owner-only RLS policies. The additive migration is `supabase/migrations/20261017063736_automatic_learning_activity.sql`. Existing preparation records remain untouched. Browser caches are scoped by authenticated user; guest activity stays local. A running exam is saved on this device and its timer continues across refreshes.

## AI

On-demand generation uses the Responses API with `model: gpt-6-luna` and `reasoning.effort: max`. It requires a signed-in account, a server-only `OPENAI_API_KEY`, and the existing `bump_ai_usage` quota function. Generation errors are shown rather than replaced with fabricated questions. The bundled practice bank is original AI-authored learning material, not official or recalled CFA questions.

## Exam structure

The bundled bank contains 186 original practice questions with explicit curriculum IDs. Full mocks select 180 questions across all ten subjects, two 90-question sessions at 135 minutes each, and an optional break of up to 30 minutes. Shorter sets remain practice quizzes. The runner supports autosave, flags, option elimination, highlighting, question navigation, submission review and answer explanations. Full-session answers cannot be changed after that session ends.

## Checks

```sh
npm run lint
node --test src/lib/exam-analysis.test.mjs
npx tsc --noEmit
npm run build
```

## Imported mock papers and automatic feedback

The six supplied scans are stored in the private Supabase `study-mocks` bucket: 1,071 available questions, with 1,065 scored from usable printed keys. A full paper keeps its original two sessions and question order. Mock 3 is partial (175 available questions: questions 1–5 are absent/incomplete); Mock 4 is partial (176 questions: questions 69–72 are absent). Four questions with conflicting printed keys (Mock 1 Q54, Mock 2 Q27/Q46, Mock 3 Q64, all session 1) and Mock 3 session 1 Q65 with no printed key remain available but unscored. Mock 4 session 1 Q68 has a cut-off option list and is also unscored. Partial papers and key issues are labeled; missing answers are never guessed. Question crops preserve the source tables, and the full PDF containing keys is linked only in completed review.

On submission, topic counts, mistakes, unanswered questions and relative timing appear immediately. GPT-6 Luna/max adds evidence-linked concept explanations. Each concept offers a retry of the actual missed questions and a fresh five-question drill. Unanswered questions do not establish misunderstanding; small samples are marked as limited evidence. Completed reports sync with the saved attempt.

Private source copies and extraction output are ignored by Git (`data/imported-mocks`, `tmp/mock-import`). `scripts/upload-mock-library.cjs` uploads a prepared library with a server-only service key; it publishes the catalog last and skips unchanged content. Source files are readable by signed-in app users, not anonymous Storage requests. `ALLOW_LOCAL_STUDY_GUEST=true` in ignored `.env.local` enables local testing without signing in; leave it unset in hosted environments.
